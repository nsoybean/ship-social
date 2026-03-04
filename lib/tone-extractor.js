import * as ai from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { AI_TEXT_MODEL } from "./ai-content";

const FALLBACK_TONE = {
  label: "Friendly Indie Hacker",
  description: "First-person, casual product updates with build-in-public energy.",
  rules: [
    "Write in first person and keep it conversational.",
    "Lead with the shipped outcome before implementation details.",
    "Use concise sentences and plain developer-friendly language.",
    "Include one light CTA inviting feedback or discussion.",
    "Keep an honest builder tone: practical, transparent, and positive."
  ].join("\n")
};

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

function sanitizeLine(input, max) {
  const value = String(input || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd();
}

function parseExamples(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return [];

  const blocks = raw
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (blocks.length >= 3) {
    return blocks.slice(0, 8);
  }

  return raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeToneSuggestion(payload) {
  const label = sanitizeLine(payload?.label, 48);
  const description = sanitizeLine(payload?.description, 160);
  const rules = String(payload?.rules || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("\n");

  if (!label || !rules || rules.length < 16) {
    return FALLBACK_TONE;
  }

  return {
    label,
    description,
    rules
  };
}

export async function extractToneFromExamples({ examplesText, githubLogin = "" }) {
  const examples = parseExamples(examplesText);
  if (examples.length < 3) {
    throw new Error("Please paste at least 3 example posts (separate posts with blank lines).");
  }

  const textModel = resolveTextModel();
  if (!textModel) {
    throw new Error("No AI provider configured for tone extraction.");
  }

  const prompt = [
    "You are an expert writing-tone analyst for social posts by indie hackers.",
    "Infer a reusable tone profile from the examples.",
    "Return strict JSON only with this shape:",
    '{"label":"...","description":"...","rules":"..."}',
    "Requirements:",
    "- label: 2-4 words, title case, <= 48 chars, no punctuation-heavy names.",
    "- description: one short sentence, <= 160 chars.",
    "- rules: 5-8 concise instruction lines for a model to mimic this tone.",
    "- rules should capture POV, energy, vocabulary, sentence style, CTA style, and emoji usage.",
    "- keep rules practical and specific to social product updates.",
    "Context:",
    `author: ${githubLogin || "indie hacker builder"}`,
    "examples:",
    ...examples.map((example, index) => `${index + 1}. ${example}`)
  ].join("\n");

  logDevAiPayload("tone-extract-input", {
    model: textModel.modelId,
    providerMode: textModel.mode,
    exampleCount: examples.length,
    prompt
  });

  const result = await ai.generateText({
    model: textModel.model,
    prompt
  });

  const rawText = String(result?.text || "");
  const parsed = parseJsonFromText(rawText);
  const suggestion = sanitizeToneSuggestion(parsed);

  logDevAiPayload("tone-extract-output", {
    raw: rawText,
    parsed,
    suggestion
  });

  return {
    suggestion,
    exampleCount: examples.length
  };
}
