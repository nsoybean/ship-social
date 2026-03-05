import { NextResponse } from "next/server";
import { getSessionToken, SESSION_COOKIE, buildCookieOptions } from "@/lib/session";
import { clearSession } from "@/lib/store";

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await clearSession(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...buildCookieOptions(),
    maxAge: 0
  });

  return response;
}
