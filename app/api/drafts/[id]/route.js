import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { updateDraft } from "@/lib/store";

export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const draft = updateDraft(user.id, id, body || {});
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update draft" },
      { status: 400 }
    );
  }
}
