import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listConnectedReposPage, connectSelectedRepos } from "@/lib/store";

function parsePaginationValue(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parsePaginationValue(url.searchParams.get("page"), 1, 1, 10000);
  const limit = parsePaginationValue(url.searchParams.get("limit"), 50, 1, 100);
  const result = listConnectedReposPage(user.id, { page, limit });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    hasMore: result.hasMore
  });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const selected = Array.isArray(body.selectedRepos) ? body.selectedRepos : [];

    if (selected.length === 0) {
      return NextResponse.json({ error: "Select at least one repo" }, { status: 400 });
    }

    const normalized = selected.map((repo) => ({
      id: String(repo.id),
      full_name: String(repo.full_name),
      name: String(repo.name),
      private: Boolean(repo.private),
      default_branch: String(repo.default_branch || "main"),
      owner: {
        login: String(repo.owner?.login || "")
      },
      autoGenerate: repo.autoGenerate !== false
    }));

    const connected = connectSelectedRepos(user.id, normalized);
    return NextResponse.json({ repos: connected });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect repos" },
      { status: 400 }
    );
  }
}
