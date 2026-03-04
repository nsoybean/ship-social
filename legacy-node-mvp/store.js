const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = path.join(__dirname, "..", "data", "state.json");

const defaultState = () => ({
  users: [],
  repos: [],
  releases: [],
  postDrafts: [],
  mediaAssets: [],
  brandingProfiles: [],
  inboxItems: [],
  approvals: [],
  publishAttempts: [],
  jobs: [],
  sessions: []
});

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeState(rawState) {
  const base = defaultState();
  const safe = rawState && typeof rawState === "object" ? rawState : {};

  const normalized = {
    users: ensureArray(safe.users),
    repos: ensureArray(safe.repos),
    releases: ensureArray(safe.releases),
    postDrafts: ensureArray(safe.postDrafts),
    mediaAssets: ensureArray(safe.mediaAssets),
    brandingProfiles: ensureArray(safe.brandingProfiles),
    inboxItems: ensureArray(safe.inboxItems),
    approvals: ensureArray(safe.approvals),
    publishAttempts: ensureArray(safe.publishAttempts),
    jobs: ensureArray(safe.jobs),
    sessions: ensureArray(safe.sessions)
  };

  // One-time compatibility for old scaffold.
  if (normalized.releases.length === 0 && ensureArray(safe.features).length > 0) {
    normalized.releases = ensureArray(safe.features).map((feature) => ({
      id: feature.id,
      repoId: feature.repoId || null,
      githubReleaseId: feature.githubReleaseId || null,
      title: feature.title || "",
      body: feature.description || "",
      tag: feature.tag || "",
      url: feature.url || "",
      status: feature.status || "processed",
      processed: true,
      createdAt: feature.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  if (normalized.postDrafts.length === 0 && ensureArray(safe.posts).length > 0) {
    normalized.postDrafts = ensureArray(safe.posts).map((post) => ({
      id: post.id,
      releaseId: post.featureId || null,
      userId: post.userId || null,
      selectedVariantId: null,
      variants: [
        {
          id: `${post.id}_variant_1`,
          type: "build-in-public",
          text: post.content || ""
        }
      ],
      thread: [],
      status: post.status || "draft_ready",
      publishedText: null,
      createdAt: post.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  return { ...base, ...normalized };
}

function readState() {
  if (!fs.existsSync(DB_PATH)) {
    return defaultState();
  }

  const raw = fs.readFileSync(DB_PATH, "utf8");
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function writeState(nextState) {
  const normalized = normalizeState(nextState);
  fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2));
}

function withState(mutator) {
  const state = readState();
  const result = mutator(state);
  writeState(state);
  return result;
}

module.exports = {
  readState,
  writeState,
  withState,
  DB_PATH
};
