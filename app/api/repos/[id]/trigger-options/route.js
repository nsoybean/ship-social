import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  fetchLatestReleaseForRepo,
  fetchLatestMergedPrForRepo,
  fetchRecentDefaultBranchCommitsForRepo
} from "@/lib/github";
import { getConnectedRepoById } from "@/lib/store";

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function GET(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const repo = await getConnectedRepoById(user.id, id);
  if (!repo) {
    return NextResponse.json({ error: "Connected repo not found" }, { status: 404 });
  }

  const [releaseResult, prResult, commitsResult] = await Promise.allSettled([
    fetchLatestReleaseForRepo(repo.fullName, user.accessToken),
    fetchLatestMergedPrForRepo(repo.fullName, repo.defaultBranch, user.accessToken),
    fetchRecentDefaultBranchCommitsForRepo(repo.fullName, repo.defaultBranch, user.accessToken, 15)
  ]);

  const releaseOption = releaseResult.status === "fulfilled"
    ? {
        available: true,
        item: {
          id: releaseResult.value.id,
          tag: releaseResult.value.tag,
          title: releaseResult.value.title,
          url: releaseResult.value.url
        },
        error: null
      }
    : {
        available: false,
        item: null,
        error: normalizeError(releaseResult.reason, "No published release found.")
      };

  const prOption = prResult.status === "fulfilled"
    ? {
        available: true,
        item: {
          prNumber: prResult.value.prNumber,
          tag: prResult.value.tag,
          title: prResult.value.title,
          url: prResult.value.url,
          mergedAt: prResult.value.mergedAt || null
        },
        error: null
      }
    : {
        available: false,
        item: null,
        error: normalizeError(prResult.reason, "No merged PR found.")
      };

  const commitsOption = commitsResult.status === "fulfilled"
    ? {
        available: (commitsResult.value || []).length > 0,
        items: (commitsResult.value || []).map((commit) => ({
          sha: commit.sha,
          shortSha: commit.shortSha,
          message: commit.message,
          author: commit.author,
          committedAt: commit.committedAt,
          url: commit.url
        })),
        maxSelectable: 8,
        error: null
      }
    : {
        available: false,
        items: [],
        maxSelectable: 8,
        error: normalizeError(commitsResult.reason, "No commits found.")
      };

  return NextResponse.json({
    ok: true,
    repo: {
      id: repo.id,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch
    },
    options: {
      auto: {
        available: true,
        description: "Auto-detect in order: Release → Merged PR → Direct commits"
      },
      github_release: releaseOption,
      merged_pr: prOption,
      commits: commitsOption
    }
  });
}
