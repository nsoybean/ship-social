import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { deleteInboxItem } from "@/lib/store";

export async function DELETE(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = deleteInboxItem(user.id, id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete inbox item" },
      { status: 400 }
    );
  }
}
