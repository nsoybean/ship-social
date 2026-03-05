import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listDraftsPage } from "@/lib/store";

function parsePaginationValue(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parsePaginationValue(url.searchParams.get("page"), 1, 1, 10000);
  const limit = parsePaginationValue(url.searchParams.get("limit"), 50, 1, 100);
  const result = await listDraftsPage(user.id, { page, limit });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    hasMore: result.hasMore
  });
}
