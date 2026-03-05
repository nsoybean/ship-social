import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { clearUserProfileData } from "@/lib/store";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cleared = await clearUserProfileData(user.id);
    return NextResponse.json({ ok: true, cleared });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear profile data" },
      { status: 400 }
    );
  }
}
