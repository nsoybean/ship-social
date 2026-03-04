import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { fetchGithubRepos } from "@/lib/github";
import { listConnectedRepos } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [repos, connected] = await Promise.all([
      fetchGithubRepos(user.accessToken),
      Promise.resolve(listConnectedRepos(user.id))
    ]);

    const connectedIds = new Set(connected.map((item) => String(item.githubRepoId)));

    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: String(repo.id),
        full_name: repo.full_name,
        name: repo.name,
        private: Boolean(repo.private),
        default_branch: repo.default_branch || "main",
        owner: {
          login: repo.owner?.login || ""
        },
        html_url: repo.html_url,
        connected: connectedIds.has(String(repo.id))
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch repos" },
      { status: 400 }
    );
  }
}
