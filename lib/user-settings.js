export const AI_PROVIDER_AUTO = "auto";
export const AI_PROVIDER_GATEWAY = "gateway";
export const AI_PROVIDER_OPENAI = "openai";

export const DEFAULT_AI_TEXT_MODEL = process.env.AI_TEXT_MODEL || "openai/o4-mini";
export const DEFAULT_AI_IMAGE_MODEL =
  process.env.AI_IMAGE_MODEL || "google/gemini-2.5-flash-image";
export const DEFAULT_OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export const AI_PROVIDER_VALUES = [
  AI_PROVIDER_AUTO,
  AI_PROVIDER_GATEWAY,
  AI_PROVIDER_OPENAI
];

function cleanLine(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (!Number.isFinite(max) || max <= 0 || text.length <= max) {
    return text;
  }
  return text.slice(0, max).trimEnd();
}

function sanitizeColor(value, fallback) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }
  return fallback;
}

function sanitizeLogoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  if (/^https?:\/\/\S+$/i.test(url)) {
    return url;
  }

  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(url) && url.length <= 2_000_000) {
    return url;
  }

  return "";
}

export function hasGatewayKey() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY);
}

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function normalizeGatewayModel(modelId) {
  const value = String(modelId || "").trim();
  if (!value) return "openai/o4-mini";
  return value.includes("/") ? value : `openai/${value}`;
}

export function stripOpenAIPrefix(modelId) {
  const value = String(modelId || "").trim();
  return value.startsWith("openai/") ? value.slice("openai/".length) : value;
}

export function defaultAiSettings() {
  return {
    provider: AI_PROVIDER_AUTO,
    textModel: DEFAULT_AI_TEXT_MODEL,
    imageModel: DEFAULT_AI_IMAGE_MODEL
  };
}

export function defaultBrandProfile() {
  return {
    logoUrl: "",
    title: "",
    description: "",
    colors: {
      primary: "#5ea2ff",
      accent: "#92edce",
      background: "#fcfcff"
    }
  };
}

export function sanitizeAiSettings(raw) {
  const base = defaultAiSettings();
  const value = raw && typeof raw === "object" ? raw : {};

  const provider = String(value.provider || "").trim().toLowerCase();

  const safeProvider = AI_PROVIDER_VALUES.includes(provider)
    ? provider
    : base.provider;

  const textModel = cleanLine(value.textModel || base.textModel, 120) || base.textModel;
  const imageModelInput = cleanLine(value.imageModel || "", 120);
  const imageModelFallback =
    safeProvider === AI_PROVIDER_OPENAI
      ? DEFAULT_OPENAI_IMAGE_MODEL
      : base.imageModel;
  const imageModel = imageModelInput || imageModelFallback;

  return {
    provider: safeProvider,
    textModel,
    imageModel
  };
}

export function sanitizeBrandProfile(raw) {
  const base = defaultBrandProfile();
  const value = raw && typeof raw === "object" ? raw : {};
  const colors = value.colors && typeof value.colors === "object" ? value.colors : {};

  return {
    logoUrl: sanitizeLogoUrl(value.logoUrl),
    title: cleanLine(value.title, 120),
    description: cleanLine(value.description, 280),
    colors: {
      primary: sanitizeColor(colors.primary, base.colors.primary),
      accent: sanitizeColor(colors.accent, base.colors.accent),
      background: sanitizeColor(colors.background, base.colors.background)
    }
  };
}

export function getAiCapabilities() {
  const gatewayConfigured = hasGatewayKey();
  const openaiConfigured = hasOpenAIKey();
  const availableProviders = [];

  if (gatewayConfigured) {
    availableProviders.push(AI_PROVIDER_GATEWAY);
  }

  if (openaiConfigured) {
    availableProviders.push(AI_PROVIDER_OPENAI);
  }

  return {
    gatewayConfigured,
    openaiConfigured,
    availableProviders,
    defaultTextModel: DEFAULT_AI_TEXT_MODEL,
    defaultGatewayImageModel: DEFAULT_AI_IMAGE_MODEL,
    defaultOpenAIImageModel: DEFAULT_OPENAI_IMAGE_MODEL
  };
}
