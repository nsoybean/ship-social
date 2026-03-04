export const WRITING_STYLES = [
  {
    id: "release_crisp",
    label: "Release Crisp",
    description: "Concise product release notes with clear whats-new bullets.",
    rules: "Keep it concise, factual, and product-release oriented.",
    isPreset: true
  },
  {
    id: "builder_story",
    label: "Builder Story",
    description: "Release framing with build-in-public context and tradeoffs.",
    rules: "Mention the why behind this release and a short builder narrative.",
    isPreset: true
  },
  {
    id: "outcome_first",
    label: "Outcome First",
    description: "Lead with user benefit and measurable impact.",
    rules: "Prioritize user outcomes and practical value from this release.",
    isPreset: true
  }
];

export const DEFAULT_WRITING_STYLE = WRITING_STYLES[0].id;

export function resolveWritingStyle(styleId) {
  const value = String(styleId || "").trim();
  return WRITING_STYLES.find((item) => item.id === value) || WRITING_STYLES[0];
}
