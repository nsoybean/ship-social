import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  createUserBrandProfile,
  createUserToneProfile,
  getUserSettings,
  updateUserSettings
} from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getUserSettings(user.id));
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body?.newToneProfile && typeof body.newToneProfile === "object") {
      const created = await createUserToneProfile(user.id, body.newToneProfile);
      const settings = await getUserSettings(user.id);
      return NextResponse.json({
        ...settings,
        createdToneProfile: created.createdToneProfile || null,
        mode: created.mode || "created"
      });
    }

    if (body?.newBrandProfile && typeof body.newBrandProfile === "object") {
      const created = await createUserBrandProfile(user.id, body.newBrandProfile);
      return NextResponse.json(created);
    }

    const updates: Record<string, unknown> = {};
    if (body && Object.prototype.hasOwnProperty.call(body, "writingStyle")) {
      updates.writingStyle = body.writingStyle;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "aiSettings")) {
      updates.aiSettings = body.aiSettings;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "brandProfile")) {
      updates.brandProfile = body.brandProfile;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "brandProfiles")) {
      updates.brandProfiles = body.brandProfiles;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "activeBrandProfile")) {
      updates.activeBrandProfile = body.activeBrandProfile;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "activeBrandLabel")) {
      updates.activeBrandLabel = body.activeBrandLabel;
    }

    const updated = await updateUserSettings(user.id, updates);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update preferences" },
      { status: 400 }
    );
  }
}
