import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listInboxItemsPage } from "@/lib/store";

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
  const limit = parsePaginationValue(url.searchParams.get("limit"), 30, 1, 100);
  const offset = parsePaginationValue(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const page = listInboxItemsPage(user.id, { limit, offset });

  return NextResponse.json({
    items: page.items,
    page: {
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset
    }
  });
}
