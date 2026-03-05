import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { toggleRepoAutomation } from "@/lib/store";

export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await toggleRepoAutomation(user.id, id, body.autoGenerate);
    return NextResponse.json({ repo: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update repo" },
      { status: 400 }
    );
  }
}
