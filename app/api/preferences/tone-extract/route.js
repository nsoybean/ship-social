import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { extractToneFromExamples } from "@/lib/tone-extractor";

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const examplesText = String(body?.examples || "").trim();
    if (!examplesText) {
      return NextResponse.json(
        { error: "Paste 3-5 example posts to extract tone." },
        { status: 400 }
      );
    }

    const extracted = await extractToneFromExamples({
      examplesText,
      githubLogin: user.githubLogin
    });

    return NextResponse.json({
      ok: true,
      suggestedTone: extracted.suggestion,
      meta: {
        exampleCount: extracted.exampleCount
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract tone." },
      { status: 400 }
    );
  }
}

