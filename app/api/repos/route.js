import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listConnectedRepos, connectSelectedRepos } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ repos: listConnectedRepos(user.id) });
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
