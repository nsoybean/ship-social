import { resolveWritingStyle } from "./writing-styles";

function clean(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .replace(/`+/g, "")
    .trim();
}

function clamp(text, max = 280) {
  const value = clean(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function sentenceCase(input) {
  const value = clean(input);
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizeReleaseTitle(title, tag) {
  const raw = clean(title || "");
  if (!raw || /^feat\//i.test(raw)) {
    const feature = raw.replace(/^feat\//i, "").replace(/[\-_]/g, " ").trim();
    if (feature) {
      return `${sentenceCase(feature)} improvements`;
    }
  }

  if (raw) {
    return sentenceCase(raw);
  }

  return clean(tag) || "New update";
}

function deriveUserFacingPoints(release) {
  const points = [];

  const textPool = [
    release?.title,
    release?.body,
    ...(Array.isArray(release?.context?.highlights) ? release.context.highlights : []),
    ...(Array.isArray(release?.context?.commits)
      ? release.context.commits.map((item) => item?.message)
      : []),
    ...(Array.isArray(release?.context?.files)
      ? release.context.files.map((item) => item?.patchPreview)
      : [])
  ]
    .map((item) => clean(item))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (textPool.includes("telegram")) {
    points.push("Telegram interactions now feel smoother and more reliable.");
  }
  if (textPool.includes("loading") && textPool.includes("inline")) {
    points.push("Loading status now appears inline, so users keep context while waiting.");
  }
  if (textPool.includes("description") || textPool.includes("label") || textPool.includes("shorter")) {
    points.push("Labels and option text are clearer, making choices faster.");
  }
  if (textPool.includes("delete message") || textPool.includes("actual response") || textPool.includes("loader")) {
    points.push("Temporary loading messages are cleaned up once the final response arrives.");
  }
  if (textPool.includes("keyboard")) {
    points.push("Inline keyboard flows are easier to scan and interact with.");
  }

  const bodyLines = String(release?.body || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .map((line) => sentenceCase(line));

  for (const line of bodyLines) {
    if (points.length >= 4) break;
    if (!line) continue;
    if (line.includes("/") || line.includes(".ts") || line.includes("(")) continue;
    points.push(line.endsWith(".") ? line : `${line}.`);
  }

  const deduped = Array.from(new Set(points.map((line) => clean(line)).filter(Boolean)));

  if (deduped.length > 0) {
    return deduped.slice(0, 4);
  }

  return [
    "The feature was refined to reduce friction in day-to-day usage.",
    "Interaction flow is now clearer and easier to follow.",
    "Polish and reliability updates shipped in this release."
  ];
}

function resolveStyleProfile(styleId, styleProfile) {
  if (styleProfile && typeof styleProfile === "object" && styleProfile.id) {
    return styleProfile;
  }
  return resolveWritingStyle(styleId);
}

function buildReleaseSummary({ repoFullName, release, styleId, styleProfile }) {
  const style = resolveStyleProfile(styleId, styleProfile);
  const title = humanizeReleaseTitle(release?.title, release?.tag);
  const tag = clean(release?.tag || "update");
  const url = clean(release?.url || "");
  const points = deriveUserFacingPoints(release);

  return {
    style,
    title,
    tag,
    url,
    points,
    repo: repoFullName
  };
}

export function createDraftVariants({ repoFullName, release, styleId, styleProfile }) {
  const summary = buildReleaseSummary({ repoFullName, release, styleId, styleProfile });

  const technicalLead =
    summary.style.id === "builder_story"
      ? `Shipped ${summary.title} in ${summary.repo}.`
      : `Released ${summary.title} in ${summary.repo}.`;

  const technical = clamp(
    `${technicalLead} ${summary.points[0]} ${summary.points[1] || ""} ` +
      `What this improves: faster, clearer interactions for users.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  const buildInPublic = clamp(
    `Small but meaningful release: ${summary.title}. ` +
      `${summary.points[0]} ${summary.points[2] || ""} ` +
      `Shipping in public means tightening UX details every week.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  const outcome = clamp(
    `${summary.title} is live. ` +
      `User outcome: ${summary.points[0]} ${summary.points[1] || ""} ` +
      `This should make the flow feel smoother end-to-end.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  return [
    { type: "technical", text: technical },
    { type: "build-in-public", text: buildInPublic },
    { type: "outcome-focused", text: outcome }
  ];
}

export function isSocialReadyVariant(text) {
  const value = clean(text);
  if (!value) return false;

  const technicalNoise =
    /\bPR\s*#\d+\b/i.test(value) ||
    /\bpull request\b/i.test(value) ||
    /\bvia\s+PR\b/i.test(value) ||
    /\bupdate today\b/i.test(value) ||
    /src\//i.test(value) ||
    /\.[jt]sx?\b/i.test(value) ||
    /\b[a-z]+[A-Z][A-Za-z0-9_]*\b/.test(value) ||
    /\b[A-Za-z0-9_]+\([^)]*\)/.test(value) ||
    /\+\d+\s*\/\s*-\d+/.test(value) ||
    /\bcode delta\b/i.test(value) ||
    /\bpatch\b/i.test(value) ||
    /\bbaseRef\b|\bheadRef\b/i.test(value);

  if (technicalNoise) return false;
  if (value.length > 285) return false;

  return true;
}
