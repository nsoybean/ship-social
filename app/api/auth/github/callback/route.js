import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken, fetchGithubProfile } from "@/lib/github";
import { upsertGithubUser, createSession } from "@/lib/store";
import { buildCookieOptions, SESSION_COOKIE } from "@/lib/session";

const OAUTH_STATE_COOKIE = "ship_social_oauth_state";

export async function GET(request) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const nextUrl = new URL(request.url);
  const code = nextUrl.searchParams.get("code") || "";
  const state = nextUrl.searchParams.get("state") || "";
  const error = nextUrl.searchParams.get("error") || "";

  const redirectTarget = new URL("/", appUrl);

  if (error) {
    redirectTarget.searchParams.set("error", error);
    return NextResponse.redirect(redirectTarget);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value || "";

  if (!code || !state || !expectedState || state !== expectedState) {
    redirectTarget.searchParams.set("error", "GitHub OAuth state mismatch.");
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const profile = await fetchGithubProfile(accessToken);
    const user = await upsertGithubUser(profile, accessToken);
    const session = await createSession(user.id);

    const response = NextResponse.redirect(redirectTarget);
    response.cookies.set(SESSION_COOKIE, session.token, buildCookieOptions());
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });

    return response;
  } catch (authError) {
    redirectTarget.searchParams.set(
      "error",
      authError instanceof Error ? authError.message : "GitHub OAuth failed"
    );
    return NextResponse.redirect(redirectTarget);
  }
}
