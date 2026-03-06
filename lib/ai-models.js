import { createOpenAI } from "@ai-sdk/openai";
import {
  DEFAULT_AI_TEXT_MODEL,
  DEFAULT_OPENAI_IMAGE_MODEL,
  hasGatewayKey,
  hasOpenAIKey,
  normalizeGatewayModel,
  sanitizeAiSettings,
  stripOpenAIPrefix
} from "./user-settings";

function resolvePreferredProvider(aiSettings) {
  const settings = sanitizeAiSettings(aiSettings);
  const wantsGateway = settings.provider === "gateway";
  const wantsOpenAI = settings.provider === "openai";
  const gatewayAvailable = hasGatewayKey();
  const openaiAvailable = hasOpenAIKey();

  if ((settings.provider === "auto" || wantsGateway) && gatewayAvailable) {
    return "gateway";
  }

  if ((settings.provider === "auto" || wantsOpenAI) && openaiAvailable) {
    return "openai";
  }

  if (gatewayAvailable) {
    return "gateway";
  }

  if (openaiAvailable) {
    return "openai";
  }

  return null;
}

function resolveOpenAITextModelId(value) {
  const stripped = stripOpenAIPrefix(value || DEFAULT_AI_TEXT_MODEL);
  if (!stripped) return "gpt-4.1-mini";
  if (stripped.includes("/")) return "gpt-4.1-mini";
  return stripped;
}

function resolveOpenAIImageModelId(value) {
  const stripped = stripOpenAIPrefix(value || DEFAULT_OPENAI_IMAGE_MODEL);
  if (!stripped) return "gpt-image-1";
  if (stripped.includes("/")) return "gpt-image-1";
  return stripped;
}

export function resolveTextModel(aiSettings) {
  const provider = resolvePreferredProvider(aiSettings);
  if (!provider) return null;

  const settings = sanitizeAiSettings(aiSettings);

  if (provider === "gateway") {
    const modelId = normalizeGatewayModel(settings.textModel || DEFAULT_AI_TEXT_MODEL);
    return {
      mode: "gateway",
      provider,
      modelId,
      model: modelId
    };
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: "strict"
  });
  const modelId = resolveOpenAITextModelId(settings.textModel);

  return {
    mode: "openai",
    provider,
    modelId,
    model: openai(modelId)
  };
}

export function resolveImageModel(aiSettings) {
  const provider = resolvePreferredProvider(aiSettings);
  if (!provider) return null;

  const settings = sanitizeAiSettings(aiSettings);

  if (provider === "gateway") {
    const modelId = normalizeGatewayModel(settings.imageModel);
    return {
      mode: "gateway",
      provider,
      modelId,
      model: modelId
    };
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: "strict"
  });
  const modelId = resolveOpenAIImageModelId(settings.imageModel);

  return {
    mode: "openai",
    provider,
    modelId,
    model: openai.image(modelId)
  };
}

export function isGeminiNanoBananaModel(modelId) {
  const value = String(modelId || "").toLowerCase();
  return value.startsWith("google/") && value.includes("image");
}
