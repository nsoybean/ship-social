import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  fetchLatestReleaseForRepo,
  fetchLatestMergedPrForRepo,
  fetchMergedPrContextForRepo
} from "@/lib/github";
import { createDraftFromRun, getConnectedRepoById, recordManualTrigger } from "@/lib/store";

export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const repo = getConnectedRepoById(user.id, id);
  if (!repo) {
    return NextResponse.json({ error: "Connected repo not found" }, { status: 404 });
  }

  try {
    let release = null;
    let signal = "github_release";

    try {
      release = await fetchLatestReleaseForRepo(repo.fullName, user.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("No published GitHub release found")) {
        throw error;
      }

      release = await fetchLatestMergedPrForRepo(repo.fullName, repo.defaultBranch, user.accessToken);
      const context = await fetchMergedPrContextForRepo(repo.fullName, release.prNumber, user.accessToken);
      release = {
        ...release,
        context
      };
      signal = "merged_pr";
    }

    const result = recordManualTrigger(user.id, repo.id, {
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
    const result = recordManualTrigger(user.id, repo.id, {
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
