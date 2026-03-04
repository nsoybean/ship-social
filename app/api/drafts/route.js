import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listDrafts } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ drafts: listDrafts(user.id) });
}
