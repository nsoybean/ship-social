import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getUserWritingPreference, listConnectedRepos } from "@/lib/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const connectedRepos = await listConnectedRepos(user.id);
  const preferences = await getUserWritingPreference(user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      githubLogin: user.githubLogin,
      githubName: user.githubName,
      avatarUrl: user.avatarUrl,
      writingStyle: preferences.writingStyle
    },
    writingStyles: preferences.writingStyles,
    connectedRepoCount: connectedRepos.length
  });
}
