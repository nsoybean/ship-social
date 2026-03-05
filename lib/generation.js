import { resolveWritingStyle } from "./writing-styles";

function clean(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .replace(/`+/g, "")
    .trim();
}

function isTechnicalGithubUrl(url) {
  const value = clean(url);
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("github.com")) return false;

    const path = parsed.pathname.toLowerCase();
    return (
      path.includes("/compare/") ||
      path.includes("/commit/") ||
      path.includes("/pull/")
    );
  } catch {
    return /github\.com\/.+\/(compare|commit|pull)\//i.test(value);
  }
}

function toSocialUrl(url) {
  const value = clean(url);
  if (!value) return "";
  if (isTechnicalGithubUrl(value)) return "";
  return value;
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
  if (/^\d+\s+commits?\s+on\s+[a-z0-9._/-]+$/i.test(raw)) {
    return "Product improvements";
  }
  if (/^commit\s+[0-9a-f]{7,40}$/i.test(raw)) {
    return "Product improvements";
  }

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
    if (/^(feat|fix|chore|refactor|docs|test|ci|build|perf|style)(\(.+\))?:/i.test(line)) continue;
    if (/^\d+\s+commits?\s+on\s+/i.test(line)) continue;
    if (/\bPR\s*#\d+\b/i.test(line)) continue;
    if (/github\.com\/.+\/(compare|commit|pull)\//i.test(line)) continue;
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
  const url = toSocialUrl(release?.url || "");
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

  const technicalCandidate = clamp(
    `${technicalLead} ${summary.points[0]} ${summary.points[1] || ""} ` +
      `What this improves: faster, clearer interactions for users.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  const buildInPublicCandidate = clamp(
    `Small but meaningful release: ${summary.title}. ` +
      `${summary.points[0]} ${summary.points[2] || ""} ` +
      `Shipping in public means tightening UX details every week.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  const outcomeCandidate = clamp(
    `${summary.title} is live. ` +
      `User outcome: ${summary.points[0]} ${summary.points[1] || ""} ` +
      `This should make the flow feel smoother end-to-end.` +
      `${summary.url ? ` ${summary.url}` : ""}`
  );

  const safeFallbacks = [
    clamp(
      `Released product improvements in ${summary.repo}. ${summary.points[0]} ${summary.points[1] || ""} ` +
        "What this improves: faster, clearer interactions for users."
    ),
    clamp(
      `Small but meaningful release: product improvements. ${summary.points[0]} ${summary.points[2] || ""} ` +
        "Shipping in public means tightening UX details every week."
    ),
    clamp(
      `Product improvements are live. User outcome: ${summary.points[0]} ${summary.points[1] || ""} ` +
        "This should make the flow feel smoother end-to-end."
    )
  ];

  const candidates = [technicalCandidate, buildInPublicCandidate, outcomeCandidate];
  const safeTexts = candidates.map((text, index) =>
    isSocialReadyVariant(text) ? text : safeFallbacks[index]
  );

  return [
    { type: "technical", text: safeTexts[0] },
    { type: "build-in-public", text: safeTexts[1] },
    { type: "outcome-focused", text: safeTexts[2] }
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
  const technicalLinksOrRefs =
    /github\.com\/[^/\s]+\/[^/\s]+\/compare\/\S+/i.test(value) ||
    /github\.com\/[^/\s]+\/[^/\s]+\/commit\/[0-9a-f]{7,40}/i.test(value) ||
    /\b\d+\s+commits?\s+on\s+[a-z0-9._/-]+\b/i.test(value) ||
    /\bcommit\s+[0-9a-f]{7,40}\b/i.test(value) ||
    /\b[0-9a-f]{12,40}\b/.test(value);

  if (technicalNoise || technicalLinksOrRefs) return false;
  if (value.length > 285) return false;

  return true;
}
