function cleanText(input) {
  return String(input || "")
    .replace(/`+/g, "")
    .replace(/#+\s?/g, "")
    .replace(/\*+/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getHighlights(body) {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (lines.length > 0) {
    return lines;
  }

  const flat = cleanText(body);
  if (!flat) {
    return ["New improvements and fixes are now live."];
  }

  return [flat.slice(0, 120)];
}

function clamp(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function createVariants({ release, repoName, branding }) {
  const title = cleanText(release.title || release.tag || "New release");
  const highlights = getHighlights(release.body || "");
  const tone = branding && branding.tone ? branding.tone : "Transparent builder";
  const audience = branding && branding.audience ? branding.audience : "Developers";
  const cta = release.url ? `\n\nDetails: ${release.url}` : "";

  const technical = clamp(
    `Shipped ${title} for ${repoName}.\n\n` +
      `What changed:\n${highlights.map((line) => `• ${line}`).join("\n")}\n\n` +
      `Built for: ${audience}. #buildinpublic`,
    280
  ) + cta;

  const buildInPublic = clamp(
    `Just shipped ${title}.\n\n` +
      `This release focused on momentum: ${highlights[0]}${highlights[1] ? `, ${highlights[1]}` : ""}.\n\n` +
      `Tone: ${tone}. Appreciate every builder following along. #indiehackers #buildinpublic`,
    280
  ) + cta;

  const outcome = clamp(
    `New in ${repoName}: ${title}.\n\n` +
      `Outcome for users: ${highlights[0]}${highlights[2] ? ` + ${highlights[2]}` : ""}.\n\n` +
      `If this helps your workflow, I would love feedback.`,
    280
  ) + cta;

  return [
    { type: "technical", text: technical },
    { type: "build-in-public", text: buildInPublic },
    { type: "outcome-focused", text: outcome }
  ];
}

function createThread({ release, repoName }) {
  const title = cleanText(release.title || release.tag || "new release");
  const highlights = getHighlights(release.body || "");
  const tweets = [
    `1/ Shipped ${title} for ${repoName}.`,
    `2/ Problem: builders were losing time in repetitive workflows.`,
    `3/ What we built: ${highlights[0]}.`,
    `4/ Bonus improvements: ${highlights.slice(1).join("; ") || "stability and polish"}.`,
    `5/ Try it and share feedback${release.url ? ` ${release.url}` : "."}`
  ];

  return tweets.map((text, index) => ({ order: index + 1, text: clamp(text, 280) }));
}

module.exports = {
  createVariants,
  createThread
};
