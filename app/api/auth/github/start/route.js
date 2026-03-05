import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildGithubAuthorizeUrl, fetchGithubProfile } from "@/lib/github";
import { createSession, upsertGithubUser } from "@/lib/store";
import { buildCookieOptions, SESSION_COOKIE } from "@/lib/session";

const OAUTH_STATE_COOKIE = "ship_social_oauth_state";

export async function GET() {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const configuredAccessToken = String(process.env.GITHUB_ACCESS_TOKEN || "").trim();

  if (configuredAccessToken) {
    try {
      const profile = await fetchGithubProfile(configuredAccessToken);
      const user = await upsertGithubUser(profile, configuredAccessToken);
      const session = await createSession(user.id);

      const redirectUrl = new URL("/", appUrl);
      redirectUrl.searchParams.set("connected", "1");
      const response = NextResponse.redirect(redirectUrl);
      response.cookies.set(SESSION_COOKIE, session.token, buildCookieOptions());
      response.cookies.set(OAUTH_STATE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      });

      return response;
    } catch (error) {
      const url = new URL("/", appUrl);
      url.searchParams.set(
        "error",
        error instanceof Error ? error.message : "GitHub access token authentication failed"
      );
      return NextResponse.redirect(url);
    }
  }

  try {
    const state = crypto.randomBytes(18).toString("hex");
    const redirectUrl = buildGithubAuthorizeUrl(state);
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10
    });

    return response;
  } catch (error) {
    const url = new URL("/", appUrl);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Missing GitHub auth configuration (set GITHUB_ACCESS_TOKEN)"
    );
    return NextResponse.redirect(url);
  }
}
