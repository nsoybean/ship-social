import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  fetchLatestReleaseForRepo,
  fetchLatestMergedPrForRepo,
  fetchMergedPrContextForRepo,
  fetchMergedPrByNumberForRepo,
  fetchLatestDefaultBranchCommitForRepo,
  fetchDefaultBranchCommitContextForRepo,
  fetchCommitBatchForRepo
} from "@/lib/github";
import { createDraftFromRun, getConnectedRepoById, recordManualTrigger } from "@/lib/store";

export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const repo = await getConnectedRepoById(user.id, id);
  if (!repo) {
    return NextResponse.json({ error: "Connected repo not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  const requestedSignal = String(payload?.signal || "auto").trim().toLowerCase();
  const allowedSignals = new Set(["auto", "github_release", "merged_pr", "commits"]);
  if (!allowedSignals.has(requestedSignal)) {
    return NextResponse.json({ error: "Invalid trigger signal." }, { status: 400 });
  }

  const requestedPrNumber = Number(payload?.prNumber);
  const requestedCommitShas = Array.from(
    new Set(
      (Array.isArray(payload?.commitShas) ? payload.commitShas : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 8);

  try {
    let release = null;
    let signal = requestedSignal === "auto" ? "github_release" : requestedSignal;

    async function resolveGithubRelease() {
      release = await fetchLatestReleaseForRepo(repo.fullName, user.accessToken);
      signal = "github_release";
    }

    async function resolveMergedPr() {
      const prRelease = Number.isFinite(requestedPrNumber) && requestedPrNumber > 0
        ? await fetchMergedPrByNumberForRepo(repo.fullName, requestedPrNumber, user.accessToken)
        : await fetchLatestMergedPrForRepo(repo.fullName, repo.defaultBranch, user.accessToken);
      const context = await fetchMergedPrContextForRepo(repo.fullName, prRelease.prNumber, user.accessToken);
      release = {
        ...prRelease,
        context
      };
      signal = "merged_pr";
    }

    async function resolveCommits() {
      if (requestedCommitShas.length > 0) {
        const batch = await fetchCommitBatchForRepo(
          repo.fullName,
          repo.defaultBranch,
          requestedCommitShas,
          user.accessToken
        );
        release = {
          ...batch.release,
          context: batch.context
        };
      } else {
        const latestCommit = await fetchLatestDefaultBranchCommitForRepo(repo.fullName, repo.defaultBranch, user.accessToken);
        const context = await fetchDefaultBranchCommitContextForRepo(
          repo.fullName,
          latestCommit.sha,
          repo.defaultBranch,
          user.accessToken
        );
        release = {
          ...latestCommit,
          context
        };
      }
      signal = "default_branch_commit";
    }

    if (requestedSignal === "github_release") {
      await resolveGithubRelease();
    } else if (requestedSignal === "merged_pr") {
      await resolveMergedPr();
    } else if (requestedSignal === "commits") {
      await resolveCommits();
    } else {
      try {
        await resolveGithubRelease();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("No published GitHub release found")) {
          throw error;
        }

        try {
          await resolveMergedPr();
        } catch (prError) {
          const prErrorMessage = prError instanceof Error ? prError.message : "";
          if (!prErrorMessage.includes("No merged PR found")) {
            throw prError;
          }
          await resolveCommits();
        }
      }
    }

    const result = await recordManualTrigger(user.id, repo.id, {
      status: "ok",
      release
    });
    const generated = await createDraftFromRun(user.id, repo.id, result.run.id, {
      writingStyleId: user.writingStyle
    });

    return NextResponse.json({
      ok: true,
      signal,
      repo: result.repo,
      run: result.run,
      draft: generated.draft,
      inboxItem: generated.inboxItem
    });
  } catch (error) {
    const result = await recordManualTrigger(user.id, repo.id, {
      status: "error",
      error: error instanceof Error ? error.message : "Manual trigger failed"
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Manual trigger failed",
        repo: result.repo,
        run: result.run
      },
      { status: 400 }
    );
  }
}
