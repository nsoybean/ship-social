import * as ai from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createDraftVariants, isSocialReadyVariant } from "./generation";
import { resolveWritingStyle } from "./writing-styles";

export const AI_TEXT_MODEL = process.env.AI_TEXT_MODEL || "openai/o4-mini";
export const AI_IMAGE_MODEL =
  process.env.AI_IMAGE_MODEL || "google/gemini-2.5-flash-image";

function isDevEnv() {
  return process.env.NODE_ENV === "development";
}

function logDevAiPayload(label, payload) {
  if (!isDevEnv()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[ship-social][ai][${label}]`, JSON.stringify(payload, null, 2));
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeVariants(payload, fallback) {
  const list = Array.isArray(payload?.variants) ? payload.variants : [];
  if (list.length < 3) {
    return {
      variants: fallback,
      replacedIndexes: [0, 1, 2],
      usedFallback: true
    };
  }

  const replacedIndexes = [];
  const normalized = list.slice(0, 3).map((item, index) => {
    const candidate = String(item?.text || "").trim();
    const fallbackText = fallback[index]?.text || fallback[0]?.text || "";
    const safeText = isSocialReadyVariant(candidate) ? candidate : fallbackText;
    if (safeText !== candidate) {
      replacedIndexes.push(index);
    }
    return {
      type: fallback[index]?.type || `variant-${index + 1}`,
      text: safeText
    };
  });

  if (normalized.some((item) => !item.text)) {
    return {
      variants: fallback,
      replacedIndexes: [0, 1, 2],
      usedFallback: true
    };
  }

  return {
    variants: normalized,
    replacedIndexes,
    usedFallback: false
  };
}

function compactContext(release) {
  const context = release?.context;
  if (!context || typeof context !== "object") {
    return null;
  }

  return {
    highlights: Array.isArray(context.highlights) ? context.highlights.slice(0, 5) : [],
    pr: context.pr
      ? {
          number: context.pr.number,
          title: context.pr.title,
          labels: Array.isArray(context.pr.labels) ? context.pr.labels.slice(0, 8) : [],
          baseRef: context.pr.baseRef,
          headRef: context.pr.headRef,
          additions: context.pr.additions,
          deletions: context.pr.deletions,
          changedFiles: context.pr.changedFiles,
          commits: context.pr.commits
        }
      : null,
    files: Array.isArray(context.files)
      ? context.files.slice(0, 12).map((file) => ({
          filename: file.filename,
          status: file.status,
          changes: file.changes,
          patchPreview: file.patchPreview || ""
        }))
      : [],
    commits: Array.isArray(context.commits)
      ? context.commits.slice(0, 10).map((commit) => ({
          message: commit.message,
          author: commit.author
        }))
      : []
  };
}

function extractImageDataUrl(result) {
  const direct = result?.image;
  if (direct?.base64) {
    return `data:image/png;base64,${direct.base64}`;
  }

  const first = Array.isArray(result?.images) ? result.images[0] : null;
  if (first?.base64) {
    return `data:image/png;base64,${first.base64}`;
  }

  if (first?.base64Data) {
    return `data:image/png;base64,${first.base64Data}`;
  }

  return null;
}

function extractImageDataUrlFromFiles(files) {
  if (!Array.isArray(files)) return null;
  const imageFile = files.find(
    (file) =>
      file &&
      typeof file === "object" &&
      typeof file.mediaType === "string" &&
      file.mediaType.startsWith("image/") &&
      typeof file.base64 === "string" &&
      file.base64.length > 0
  );

  if (!imageFile) return null;
  return `data:${imageFile.mediaType};base64,${imageFile.base64}`;
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createFallbackReleaseImage({ repoFullName, release, styleLabel }) {
  const safeRepo = escapeXml(repoFullName || "repo");
  const safeTag = escapeXml(release?.tag || "release");
  const safeTitle = escapeXml(release?.title || "Untitled release");
  const safeStyle = escapeXml(styleLabel || "Release Crisp");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630">
      <stop stop-color="#F4F8FF"/>
      <stop offset="1" stop-color="#F9FFF5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="64" y="56" width="1072" height="518" rx="28" fill="#FFFFFF" stroke="#DCE4F8" stroke-width="2"/>
  <rect x="104" y="102" width="184" height="44" rx="22" fill="#EFF4FF" stroke="#C9D6F7"/>
  <text x="128" y="130" fill="#576289" font-family="monospace" font-size="22">SHIP - SOCIAL</text>
  <text x="104" y="220" fill="#222B43" font-family="monospace" font-size="56" font-weight="700">${safeTag}</text>
  <text x="104" y="286" fill="#3A476C" font-family="monospace" font-size="36">${safeTitle}</text>
  <text x="104" y="360" fill="#5E6A8F" font-family="monospace" font-size="28">Repo: ${safeRepo}</text>
  <text x="104" y="408" fill="#5E6A8F" font-family="monospace" font-size="24">Style: ${safeStyle}</text>
  <rect x="104" y="456" width="260" height="54" rx="14" fill="#EAF2FF" stroke="#C9D6F7"/>
  <text x="128" y="491" fill="#425079" font-family="monospace" font-size="22">release ready</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function hasGatewayKey() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY);
}

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function normalizeGatewayModel(modelId) {
  const value = String(modelId || "").trim();
  if (!value) return "openai/o4-mini";
  return value.includes("/") ? value : `openai/${value}`;
}

function stripOpenAIPrefix(modelId) {
  const value = String(modelId || "").trim();
  return value.startsWith("openai/") ? value.slice("openai/".length) : value;
}

function resolveTextModel() {
  if (hasGatewayKey()) {
    return {
      mode: "gateway",
      modelId: normalizeGatewayModel(AI_TEXT_MODEL),
      model: normalizeGatewayModel(AI_TEXT_MODEL)
    };
  }

  if (hasOpenAIKey()) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      compatibility: "strict"
    });
    const modelId = stripOpenAIPrefix(AI_TEXT_MODEL) || "gpt-4.1-mini";
    return {
      mode: "openai",
      modelId,
      model: openai(modelId)
    };
  }

  return null;
}

function resolveImageModel() {
  if (hasGatewayKey()) {
    return {
      mode: "gateway",
      modelId: normalizeGatewayModel(AI_IMAGE_MODEL),
      model: normalizeGatewayModel(AI_IMAGE_MODEL)
    };
  }

  if (hasOpenAIKey()) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      compatibility: "strict"
    });
    const preferredModelId = stripOpenAIPrefix(AI_IMAGE_MODEL);
    const modelId =
      preferredModelId && !preferredModelId.includes("/")
        ? preferredModelId
        : "gpt-image-1";
    return {
      mode: "openai",
      modelId,
      model: openai.image(modelId)
    };
  }

  return null;
}

function isGeminiNanoBananaModel(modelId) {
  const value = String(modelId || "").toLowerCase();
  return value.startsWith("google/") && value.includes("image");
}

export async function generateReleasePack({ repoFullName, release, writingStyleId, writingStyle }) {
  const style =
    writingStyle && typeof writingStyle === "object" && writingStyle.id
      ? writingStyle
      : resolveWritingStyle(writingStyleId);
  const fallbackVariants = createDraftVariants({
    repoFullName,
    release,
    styleId: style.id,
    styleProfile: style
  });
  const fallbackImageDataUrl = createFallbackReleaseImage({
    repoFullName,
    release,
    styleLabel: style.label
  });

  const textModel = resolveTextModel();
  const imageModel = resolveImageModel();

  if (!textModel) {
    return {
      source: "template_fallback",
      generationStatus: "error",
      generationModel: null,
      generationError: "No AI text model configured",
      writingStyleId: style.id,
      variants: fallbackVariants,
      imageDataUrl: fallbackImageDataUrl,
      imagePrompt: null
    };
  }

  let variants = fallbackVariants;
  let imagePrompt = null;
  let textGenerationStatus = "ok";
  let textGenerationError = null;
  const contextSnapshot = compactContext(release);
  const rawReleaseTag = String(release?.tag || "").trim();
  const socialReleaseTag = /^pr\s*#/i.test(rawReleaseTag) ? "" : rawReleaseTag;

  try {
    const prompt = [
      "You are a product release copywriter for indie hacker SaaS products.",
      `Writing style: ${style.label}. ${style.rules}`,
      "Return strict JSON only with shape:",
      '{"variants":[{"text":"..."},{"text":"..."},{"text":"..."}],"imagePrompt":"..."}',
      "Requirements:",
      "- Each variant is max 280 chars.",
      "- Must read like a product release update.",
      "- Include concrete what-changed details.",
      "- Keep tone developer-friendly and user-facing.",
      "- Prefer details from release_context when available.",
      "- Do NOT include file paths, function names, branch refs, commit hashes, or diff stats.",
      "- Do NOT mention PR numbers (e.g. PR #123), pull-request identifiers, or branch names in the final copy.",
      "- Avoid generic timestamp framing like 'update today' or 'released today' unless a date is explicitly relevant.",
      "- Translate technical implementation into product/user impact language.",
      "- End with a lightweight CTA when possible.",
      "Context:",
      `repo: ${repoFullName}`,
      `release_tag: ${socialReleaseTag || "(omit release tag in copy)"}`,
      `release_title: ${release?.title || "Untitled"}`,
      `release_notes: ${release?.body || ""}`,
      `release_url: ${release?.url || ""}`,
      `release_context: ${JSON.stringify(contextSnapshot || {})}`
    ].join("\n");

    logDevAiPayload("text-input", {
      model: textModel.modelId,
      providerMode: textModel.mode,
      repoFullName,
      writingStyle: style.id,
      release: {
        tag: release?.tag || "release",
        title: release?.title || "Untitled",
        url: release?.url || ""
      },
      context: contextSnapshot || {},
      prompt
    });

    const textResult = await ai.generateText({
      model: textModel.model,
      temperature: 0.6,
      prompt
    });

    const parsed = parseJsonFromText(textResult?.text || "");
    const normalized = normalizeVariants(parsed, fallbackVariants);
    variants = normalized.variants;
    imagePrompt = typeof parsed?.imagePrompt === "string" ? parsed.imagePrompt.trim() : null;

    logDevAiPayload("text-output", {
      raw: textResult?.text || "",
      parsed: parsed || null
    });
    logDevAiPayload("text-output-normalized", {
      replacedIndexes: normalized.replacedIndexes,
      usedFallback: normalized.usedFallback,
      variants
    });
  } catch (error) {
    textGenerationStatus = "error";
    textGenerationError = error instanceof Error ? error.message : "text generation failed";
    logDevAiPayload("text-error", {
      message: textGenerationError
    });
    variants = fallbackVariants;
  }

  let imageDataUrl = null;

  try {
    const prompt =
      imagePrompt ||
      `Minimal product release card for ${repoFullName}, tag ${release?.tag || "release"}, title ${
        release?.title || "Untitled"
      }, clean white background, cute geeky dev aesthetic, no text overlap.`;

    if (imageModel) {
      logDevAiPayload("image-input", {
        model: imageModel.modelId,
        providerMode: imageModel.mode,
        method: isGeminiNanoBananaModel(imageModel.modelId) ? "generateText(files)" : "generateImage",
        prompt
      });
    }

    if (imageModel && isGeminiNanoBananaModel(imageModel.modelId)) {
      const imageTextResult = await ai.generateText({
        model: imageModel.model,
        prompt
      });

      imageDataUrl = extractImageDataUrlFromFiles(imageTextResult?.files || []);
      imagePrompt = prompt;

      logDevAiPayload("image-output", {
        hasImage: Boolean(imageDataUrl),
        prompt,
        text: imageTextResult?.text || "",
        fileCount: Array.isArray(imageTextResult?.files) ? imageTextResult.files.length : 0
      });
    } else {
      const imageGenFn = ai.experimental_generateImage;
      if (typeof imageGenFn === "function" && imageModel) {
        const imageResult = await imageGenFn({
          model: imageModel.model,
          prompt,
          size: "1024x1024"
        });

        imageDataUrl = extractImageDataUrl(imageResult);
        imagePrompt = prompt;

        logDevAiPayload("image-output", {
          hasImage: Boolean(imageDataUrl),
          prompt
        });
      }
    }
  } catch (error) {
    logDevAiPayload("image-error", {
      message: error instanceof Error ? error.message : "image generation failed"
    });
    imageDataUrl = null;
  }

  if (!imageDataUrl) {
    logDevAiPayload("image-fallback", {
      reason: "AI image unavailable, using generated SVG fallback"
    });
  }

  return {
    source: "ai_sdk",
    generationStatus: textGenerationStatus,
    generationModel: textModel.modelId,
    generationError: textGenerationError,
    writingStyleId: style.id,
    variants,
    imageDataUrl: imageDataUrl || fallbackImageDataUrl,
    imagePrompt
  };
}
