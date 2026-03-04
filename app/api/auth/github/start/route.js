import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildGithubAuthorizeUrl } from "@/lib/github";

const OAUTH_STATE_COOKIE = "ship_social_oauth_state";

export async function GET() {
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
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const url = new URL("/", appUrl);
    url.searchParams.set("error", error instanceof Error ? error.message : "GitHub OAuth config missing");
    return NextResponse.redirect(url);
  }
}
