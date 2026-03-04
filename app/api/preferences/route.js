import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  createUserToneProfile,
  getUserWritingPreference,
  updateUserWritingPreference
} from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getUserWritingPreference(user.id));
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body?.newToneProfile && typeof body.newToneProfile === "object") {
      const created = createUserToneProfile(user.id, body.newToneProfile);
      return NextResponse.json(created);
    }

    const updated = updateUserWritingPreference(user.id, body?.writingStyle);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update preferences" },
      { status: 400 }
    );
  }
}
