import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getUserSettings, listConnectedRepos } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const connectedRepos = await listConnectedRepos(user.id);
  const settings = await getUserSettings(user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      githubLogin: user.githubLogin,
      githubName: user.githubName,
      avatarUrl: user.avatarUrl,
      writingStyle: settings.writingStyle
    },
    writingStyles: settings.writingStyles,
    settings: {
      aiSettings: settings.aiSettings,
      aiCapabilities: settings.aiCapabilities,
      brandProfile: settings.brandProfile,
      brandProfiles: settings.brandProfiles,
      activeBrandProfile: settings.activeBrandProfile
    },
    connectedRepoCount: connectedRepos.length
  });
}
