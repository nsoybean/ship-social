import { cookies } from "next/headers";
import { getUserBySessionToken } from "./store";

export const SESSION_COOKIE = "ship_social_session";

export async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || "";
}

export async function getSessionUser() {
  const token = await getSessionToken();
  if (!token) return null;
  return await getUserBySessionToken(token);
}

export function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  };
}
