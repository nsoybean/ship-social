import crypto from "node:crypto";
import { createDraftVariants } from "./generation";
import { generateReleasePack } from "./ai-content";
import { DEFAULT_WRITING_STYLE, resolveWritingStyle, WRITING_STYLES } from "./writing-styles";
import {
  defaultAiSettings,
  defaultBrandProfile,
  getAiCapabilities,
  sanitizeAiSettings,
  sanitizeBrandProfile
} from "./user-settings";
import {
  getStorageBackendName,
  readStateFromBackend,
  resetStorageBackendForTests,
  writeStateToBackend
} from "./storage/backend";

export async function readState() {
  return readStateFromBackend();
}

export async function writeState(next) {
  await writeStateToBackend(next);
}

export async function withState(mutator) {
  const state = await readState();
  const result = await mutator(state);
  await writeState(state);
  return result;
}

export function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function sanitizeToneProfile(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  const label = String(raw.label || "").trim();
  const description = String(raw.description || "").trim();
  const rules = String(raw.rules || "").trim();

  if (!id || !label || !rules) return null;

  return {
    id,
    label,
    description,
    rules,
    isPreset: false
  };
}

function listUserCustomToneProfiles(user) {
  if (!Array.isArray(user?.toneProfiles)) return [];
  return user.toneProfiles.map((item) => sanitizeToneProfile(item)).filter(Boolean);
}

function listToneProfilesForUser(user) {
  const presets = WRITING_STYLES.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    rules: item.rules,
    isPreset: true
  }));
  const custom = listUserCustomToneProfiles(user).filter(
    (profile) => !presets.some((preset) => preset.id === profile.id)
  );
  return [...presets, ...custom];
}

function resolveToneProfileForUser(user, styleId) {
  const profiles = listToneProfilesForUser(user);
  const value = String(styleId || "").trim();
  const selected = profiles.find((item) => item.id === value);
  if (selected) return selected;
  return profiles.find((item) => item.id === DEFAULT_WRITING_STYLE) || resolveWritingStyle(DEFAULT_WRITING_STYLE);
}

function buildUserTonePreferencePayload(user) {
  const selected = resolveToneProfileForUser(user, user?.writingStyle || DEFAULT_WRITING_STYLE);
  return {
    writingStyle: selected.id,
    writingStyles: listToneProfilesForUser(user)
  };
}

function sanitizeBrandProfileEntry(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  const label = String(raw.label || "").trim();
  if (!id || !label) return null;

  const brand = sanitizeBrandProfile(raw);
  return {
    id,
    label,
    logoUrl: brand.logoUrl,
    title: brand.title,
    description: brand.description,
    colors: brand.colors,
    isPreset: false
  };
}

function listUserBrandProfiles(user) {
  return listPersistedBrandProfiles(user);
}

function listPersistedBrandProfiles(user) {
  const raw = Array.isArray(user?.brandProfiles) ? user.brandProfiles : [];
  return raw.map((item) => sanitizeBrandProfileEntry(item)).filter(Boolean);
}

function isValidBrandLogo(value) {
  const input = String(value || "").trim();
  if (!input) return false;
  if (/^https?:\/\/\S+$/i.test(input)) return true;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(input)) return true;
  return false;
}

function assertBrandRequiredFields(brand, profileLabel = "Brand profile") {
  const context = String(profileLabel || "Brand profile");
  if (!String(brand?.title || "").trim()) {
    throw new Error(`${context}: brand name is required.`);
  }
  if (!String(brand?.description || "").trim()) {
    throw new Error(`${context}: description is required.`);
  }
  if (!String(brand?.logoUrl || "").trim()) {
    throw new Error(`${context}: image is required.`);
  }
  if (!isValidBrandLogo(brand.logoUrl)) {
    throw new Error(`${context}: image must be a valid URL or uploaded image.`);
  }
}

function normalizePersistedBrandState(user) {
  const profiles = listPersistedBrandProfiles(user);
  user.brandProfiles = profiles;

  if (profiles.length === 0) {
    user.activeBrandProfile = "";
    user.brandProfile = sanitizeBrandProfile(user.brandProfile);
    return;
  }

  const requestedId = String(user.activeBrandProfile || "").trim();
  const selected = profiles.find((item) => item.id === requestedId) || profiles[0];
  user.activeBrandProfile = selected.id;
  user.brandProfile = sanitizeBrandProfile(selected);
}

function sanitizeIncomingBrandProfiles(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Brand profiles must be an array.");
  }

  if (raw.length < 1) {
    throw new Error("At least one brand profile is required.");
  }

  if (raw.length > 3) {
    throw new Error("You can add up to 3 brand profiles.");
  }

  const seenIds = new Set();
  const seenLabels = new Set();

  return raw.map((item) => {
    const id = String(item?.id || "").trim();
    const label = String(item?.label || "").trim();

    if (!id) {
      throw new Error("Each brand profile must include an id.");
    }
    if (seenIds.has(id)) {
      throw new Error("Brand profile ids must be unique.");
    }
    seenIds.add(id);

    if (label.length < 2) {
      throw new Error("Profile label must be at least 2 characters.");
    }
    if (label.length > 64) {
      throw new Error("Profile label must be 64 characters or less.");
    }
    const normalizedLabel = label.toLowerCase();
    if (seenLabels.has(normalizedLabel)) {
      throw new Error("Brand profile labels must be unique.");
    }
    seenLabels.add(normalizedLabel);

    const brand = sanitizeBrandProfile(item);
    assertBrandRequiredFields(brand, `Brand profile "${label}"`);
    return {
      id,
      label,
      logoUrl: brand.logoUrl,
      title: brand.title,
      description: brand.description,
      colors: brand.colors,
      isPreset: false
    };
  });
}

function resolveBrandProfileForUser(user, brandProfileId) {
  const profiles = listUserBrandProfiles(user);
  if (profiles.length === 0) return null;
  const value = String(brandProfileId || "").trim();
  const selected = profiles.find((item) => item.id === value);
  return selected || profiles[0] || null;
}

function ensureUserSettings(user) {
  if (!user || typeof user !== "object") {
    return {
      writingStyle: DEFAULT_WRITING_STYLE,
      toneProfiles: [],
      aiSettings: defaultAiSettings(),
      brandProfile: sanitizeBrandProfile(defaultBrandProfile()),
      brandProfiles: [],
      activeBrandProfile: ""
    };
  }

  const brandProfiles = listUserBrandProfiles(user);
  const selectedBrand = resolveBrandProfileForUser(user, user.activeBrandProfile);

  return {
    ...user,
    writingStyle: user.writingStyle || DEFAULT_WRITING_STYLE,
    toneProfiles: Array.isArray(user.toneProfiles) ? user.toneProfiles : [],
    aiSettings: sanitizeAiSettings(user.aiSettings),
    brandProfile: sanitizeBrandProfile(selectedBrand || user.brandProfile),
    brandProfiles,
    activeBrandProfile: selectedBrand?.id || ""
  };
}

function buildUserSettingsPayload(user) {
  const safeUser = ensureUserSettings(user);
  const selected = resolveToneProfileForUser(safeUser, safeUser.writingStyle);
  const selectedBrand = resolveBrandProfileForUser(safeUser, safeUser.activeBrandProfile);

  return {
    writingStyle: selected.id,
    writingStyles: listToneProfilesForUser(safeUser),
    aiSettings: safeUser.aiSettings,
    brandProfile: sanitizeBrandProfile(selectedBrand || safeUser.brandProfile),
    brandProfiles: safeUser.brandProfiles,
    activeBrandProfile: selectedBrand?.id || "",
    aiCapabilities: getAiCapabilities()
  };
}

export async function upsertGithubUser(profile, accessToken) {
  return await withState((state) => {
    const githubId = String(profile.id);
    let user = state.users.find((item) => item.githubId === githubId);

    if (!user) {
      user = {
        id: makeId("usr"),
        githubId,
        githubLogin: profile.login || "",
        githubName: profile.name || "",
        avatarUrl: profile.avatar_url || "",
        writingStyle: DEFAULT_WRITING_STYLE,
        toneProfiles: [],
        aiSettings: defaultAiSettings(),
        brandProfile: defaultBrandProfile(),
        brandProfiles: [],
        activeBrandProfile: "",
        accessToken,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.users.push(user);
    } else {
      user.githubLogin = profile.login || user.githubLogin;
      user.githubName = profile.name || user.githubName;
      user.avatarUrl = profile.avatar_url || user.avatarUrl;
      user.accessToken = accessToken;
      if (!user.writingStyle) {
        user.writingStyle = DEFAULT_WRITING_STYLE;
      }
      if (!Array.isArray(user.toneProfiles)) {
        user.toneProfiles = [];
      }
      user.aiSettings = sanitizeAiSettings(user.aiSettings);
      normalizePersistedBrandState(user);
      user.updatedAt = new Date().toISOString();
    }

    return { ...ensureUserSettings(user) };
  });
}

export async function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");

  return await withState((state) => {
    state.sessions = state.sessions.filter((item) => item.userId !== userId);
    const session = {
      id: makeId("sess"),
      token,
      userId,
      createdAt: new Date().toISOString()
    };
    state.sessions.push(session);
    return session;
  });
}

export async function getUserBySessionToken(sessionToken) {
  if (!sessionToken) return null;
  const state = await readState();
  const session = state.sessions.find((item) => item.token === sessionToken);
  if (!session) return null;
  const user = state.users.find((item) => item.id === session.userId);
  return user ? ensureUserSettings(user) : null;
}

export async function clearSession(sessionToken) {
  await withState((state) => {
    state.sessions = state.sessions.filter((item) => item.token !== sessionToken);
  });
}

export async function getUserWritingPreference(userId) {
  const state = await readState();
  const user = state.users.find((item) => item.id === userId);
  return buildUserTonePreferencePayload(user || null);
}

export async function getUserSettings(userId) {
  const state = await readState();
  const user = state.users.find((item) => item.id === userId);
  return buildUserSettingsPayload(user || null);
}

export async function clearUserProfileData(userId) {
  return await withState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    const connectedRepoIds = new Set(
      state.connectedRepos
        .filter((repo) => repo.userId === userId)
        .map((repo) => repo.id)
    );

    const manualRunIds = new Set(
      state.manualRuns
        .filter((run) => run.userId === userId || connectedRepoIds.has(run.repoId))
        .map((run) => run.id)
    );

    const draftIds = new Set(
      state.drafts
        .filter(
          (draft) =>
            draft.userId === userId ||
            connectedRepoIds.has(draft.repoId) ||
            manualRunIds.has(draft.runId)
        )
        .map((draft) => draft.id)
    );

    const connectedReposBefore = state.connectedRepos.length;
    const manualRunsBefore = state.manualRuns.length;
    const draftsBefore = state.drafts.length;
    const inboxBefore = state.inboxItems.length;
    const toneProfilesBefore = Array.isArray(user.toneProfiles) ? user.toneProfiles.length : 0;

    state.connectedRepos = state.connectedRepos.filter((repo) => repo.userId !== userId);
    state.manualRuns = state.manualRuns.filter(
      (run) => run.userId !== userId && !connectedRepoIds.has(run.repoId)
    );
    state.drafts = state.drafts.filter(
      (draft) =>
        draft.userId !== userId &&
        !connectedRepoIds.has(draft.repoId) &&
        !manualRunIds.has(draft.runId)
    );
    state.inboxItems = state.inboxItems.filter(
      (item) => item.userId !== userId && !draftIds.has(item.draftId)
    );

    user.toneProfiles = [];
    user.writingStyle = DEFAULT_WRITING_STYLE;
    user.aiSettings = defaultAiSettings();
    user.brandProfiles = [];
    user.activeBrandProfile = "";
    user.brandProfile = sanitizeBrandProfile(defaultBrandProfile());
    user.updatedAt = new Date().toISOString();

    return {
      connectedRepos: connectedReposBefore - state.connectedRepos.length,
      manualRuns: manualRunsBefore - state.manualRuns.length,
      drafts: draftsBefore - state.drafts.length,
      inboxItems: inboxBefore - state.inboxItems.length,
      toneProfiles: toneProfilesBefore
    };
  });
}

export async function updateUserWritingPreference(userId, writingStyleId) {
  return await withState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.writingStyle = user.writingStyle || DEFAULT_WRITING_STYLE;
    user.toneProfiles = Array.isArray(user.toneProfiles) ? user.toneProfiles : [];
    user.aiSettings = sanitizeAiSettings(user.aiSettings);
    normalizePersistedBrandState(user);

    const requestedStyleId = String(writingStyleId || "").trim();
    const available = listToneProfilesForUser(user);
    if (requestedStyleId && !available.some((item) => item.id === requestedStyleId)) {
      throw new Error("Tone profile not found");
    }

    const resolved = resolveToneProfileForUser(user, writingStyleId);
    if (!resolved || !resolved.id) {
      throw new Error("Tone profile not found");
    }

    user.writingStyle = resolved.id;
    user.updatedAt = new Date().toISOString();
    return buildUserTonePreferencePayload(user);
  });
}

export async function updateUserSettings(userId, input = {}) {
  return await withState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.writingStyle = user.writingStyle || DEFAULT_WRITING_STYLE;
    user.toneProfiles = Array.isArray(user.toneProfiles) ? user.toneProfiles : [];
    user.aiSettings = sanitizeAiSettings(user.aiSettings);
    normalizePersistedBrandState(user);

    if (input && Object.prototype.hasOwnProperty.call(input, "writingStyle")) {
      const requestedStyleId = String(input.writingStyle || "").trim();
      const available = listToneProfilesForUser(user);

      if (requestedStyleId && !available.some((item) => item.id === requestedStyleId)) {
        throw new Error("Tone profile not found");
      }

      const resolved = resolveToneProfileForUser(user, requestedStyleId);
      if (!resolved?.id) {
        throw new Error("Tone profile not found");
      }

      user.writingStyle = resolved.id;
    }

    if (input && Object.prototype.hasOwnProperty.call(input, "aiSettings")) {
      const requestedTextModel = String(input?.aiSettings?.textModel || "").trim();
      const requestedImageModel = String(input?.aiSettings?.imageModel || "").trim();
      if (!requestedTextModel) {
        throw new Error("Text model is required.");
      }
      if (!requestedImageModel) {
        throw new Error("Image model is required.");
      }
      user.aiSettings = sanitizeAiSettings(input.aiSettings);
    }

    if (input && Object.prototype.hasOwnProperty.call(input, "brandProfiles")) {
      user.brandProfiles = sanitizeIncomingBrandProfiles(input.brandProfiles);
      const selectedBrand = resolveBrandProfileForUser(user, user.activeBrandProfile);
      user.activeBrandProfile = selectedBrand?.id || "";
      user.brandProfile = sanitizeBrandProfile(selectedBrand || user.brandProfile);
    }

    if (input && Object.prototype.hasOwnProperty.call(input, "activeBrandProfile")) {
      const requestedId = String(input.activeBrandProfile || "").trim();
      const selectedBrand = resolveBrandProfileForUser(user, requestedId);
      user.activeBrandProfile = selectedBrand?.id || "";
      user.brandProfile = sanitizeBrandProfile(selectedBrand || user.brandProfile);
    }

    if (input && Object.prototype.hasOwnProperty.call(input, "activeBrandLabel")) {
      const selectedBrand = resolveBrandProfileForUser(user, user.activeBrandProfile);
      const nextLabel = String(input.activeBrandLabel || "").trim();
      if (!selectedBrand) {
        throw new Error("No brand profile selected.");
      }
      if (nextLabel) {
        if (nextLabel.length < 2) {
          throw new Error("Profile label must be at least 2 characters.");
        }
        if (nextLabel.length > 64) {
          throw new Error("Profile label must be 64 characters or less.");
        }
        const duplicate = user.brandProfiles.find(
          (item) =>
            item.id !== selectedBrand.id &&
            String(item?.label || "").toLowerCase() === nextLabel.toLowerCase()
        );
        if (duplicate) {
          throw new Error("A brand profile with this label already exists.");
        }
        const index = user.brandProfiles.findIndex((item) => item.id === selectedBrand.id);
        if (index >= 0) {
          user.brandProfiles[index] = {
            ...user.brandProfiles[index],
            label: nextLabel
          };
        }
      }
    }

    if (input && Object.prototype.hasOwnProperty.call(input, "brandProfile")) {
      const selectedBrand = resolveBrandProfileForUser(user, user.activeBrandProfile);
      if (!selectedBrand) {
        throw new Error("No brand profile selected.");
      }
      const sanitizedBrand = sanitizeBrandProfile(input.brandProfile);
      const labelForValidation = String(selectedBrand?.label || "").trim() || "Brand profile";
      assertBrandRequiredFields(sanitizedBrand, `Brand profile "${labelForValidation}"`);
      const index = user.brandProfiles.findIndex((item) => item.id === selectedBrand.id);
      if (index >= 0) {
        user.brandProfiles[index] = {
          ...user.brandProfiles[index],
          ...sanitizedBrand
        };
      }
      user.brandProfile = sanitizedBrand;
    }

    user.updatedAt = new Date().toISOString();
    return buildUserSettingsPayload(user);
  });
}

export async function createUserToneProfile(userId, input) {
  return await withState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.writingStyle = user.writingStyle || DEFAULT_WRITING_STYLE;
    user.toneProfiles = Array.isArray(user.toneProfiles) ? user.toneProfiles : [];
    user.aiSettings = sanitizeAiSettings(user.aiSettings);
    normalizePersistedBrandState(user);

    const label = String(input?.label || "").trim();
    const description = String(input?.description || "").trim();
    const rules = String(input?.rules || "").trim();

    if (label.length < 3) {
      throw new Error("Tone profile name must be at least 3 characters.");
    }
    if (label.length > 48) {
      throw new Error("Tone profile name must be 48 characters or less.");
    }
    if (!rules || rules.length < 16) {
      throw new Error("Tone profile rules must be at least 16 characters.");
    }
    if (rules.length > 1200) {
      throw new Error("Tone profile rules must be 1200 characters or less.");
    }
    if (description.length > 160) {
      throw new Error("Tone profile description must be 160 characters or less.");
    }

    const existingPreset = WRITING_STYLES.find(
      (profile) => profile.label.toLowerCase() === label.toLowerCase()
    );
    if (existingPreset) {
      throw new Error("This name is reserved by a preset tone profile. Use a different name.");
    }

    const existingCustomTone = user.toneProfiles.find(
      (profile) => String(profile?.label || "").toLowerCase() === label.toLowerCase()
    );

    if (existingCustomTone) {
      existingCustomTone.description = description;
      existingCustomTone.rules = rules;
      existingCustomTone.isPreset = false;
      user.writingStyle = existingCustomTone.id;
      user.updatedAt = new Date().toISOString();

      return {
        writingStyle: user.writingStyle,
        writingStyles: listToneProfilesForUser(user),
        createdToneProfile: sanitizeToneProfile(existingCustomTone),
        mode: "updated"
      };
    }

    const toneProfile = {
      id: makeId("tone"),
      label,
      description,
      rules,
      isPreset: false
    };

    user.toneProfiles.push(toneProfile);
    user.writingStyle = toneProfile.id;
    user.updatedAt = new Date().toISOString();

    return {
      writingStyle: user.writingStyle,
      writingStyles: listToneProfilesForUser(user),
      createdToneProfile: toneProfile,
      mode: "created"
    };
  });
}

export async function createUserBrandProfile(userId, input) {
  return await withState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.writingStyle = user.writingStyle || DEFAULT_WRITING_STYLE;
    user.toneProfiles = Array.isArray(user.toneProfiles) ? user.toneProfiles : [];
    user.aiSettings = sanitizeAiSettings(user.aiSettings);
    normalizePersistedBrandState(user);

    const label = String(input?.label || "").trim();
    if (label.length < 2) {
      throw new Error("Profile label must be at least 2 characters.");
    }
    if (label.length > 64) {
      throw new Error("Profile label must be 64 characters or less.");
    }

    const sanitizedBrand = sanitizeBrandProfile(input || {});
    assertBrandRequiredFields(sanitizedBrand, `Brand profile "${label}"`);
    const existing = user.brandProfiles.find(
      (profile) => String(profile?.label || "").toLowerCase() === label.toLowerCase()
    );

    if (existing) {
      existing.label = label;
      existing.logoUrl = sanitizedBrand.logoUrl;
      existing.title = sanitizedBrand.title;
      existing.description = sanitizedBrand.description;
      existing.colors = sanitizedBrand.colors;
      existing.isPreset = false;
      user.activeBrandProfile = existing.id;
      user.brandProfile = sanitizeBrandProfile(existing);
      user.updatedAt = new Date().toISOString();

      const settings = buildUserSettingsPayload(user);
      return {
        ...settings,
        createdBrandProfile: sanitizeBrandProfileEntry(existing),
        mode: "updated"
      };
    }

    if (user.brandProfiles.length >= 3) {
      throw new Error("You can add up to 3 brand profiles.");
    }

    const brandProfile = {
      id: makeId("brand"),
      label,
      logoUrl: sanitizedBrand.logoUrl,
      title: sanitizedBrand.title,
      description: sanitizedBrand.description,
      colors: sanitizedBrand.colors,
      isPreset: false
    };

    user.brandProfiles.push(brandProfile);
    user.activeBrandProfile = brandProfile.id;
    user.brandProfile = sanitizeBrandProfile(brandProfile);
    user.updatedAt = new Date().toISOString();

    const settings = buildUserSettingsPayload(user);
    return {
      ...settings,
      createdBrandProfile: sanitizeBrandProfileEntry(brandProfile),
      mode: "created"
    };
  });
}

export async function listConnectedRepos(userId) {
  const state = await readState();
  return state.connectedRepos
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((item) => ({
      ...item,
      lastManualTriggerAt: item.lastManualTriggerAt || null,
      lastReleaseTag: item.lastReleaseTag || null,
      lastReleaseTitle: item.lastReleaseTitle || null,
      lastTriggerStatus: item.lastTriggerStatus || null
    }));
}

export async function listConnectedReposPage(userId, input = {}) {
  const rawPage = Number.parseInt(String(input?.page || "1"), 10);
  const rawLimit = Number.parseInt(String(input?.limit || "50"), 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const offset = (page - 1) * limit;

  const state = await readState();
  const allRepos = state.connectedRepos
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((item) => ({
      ...item,
      lastManualTriggerAt: item.lastManualTriggerAt || null,
      lastReleaseTag: item.lastReleaseTag || null,
      lastReleaseTitle: item.lastReleaseTitle || null,
      lastTriggerStatus: item.lastTriggerStatus || null
    }));

  const items = allRepos.slice(offset, offset + limit);
  const total = allRepos.length;

  return { items, total, page, limit, hasMore: offset + items.length < total };
}

export async function connectSelectedRepos(userId, repos) {
  const now = new Date().toISOString();

  return await withState((state) => {
    const existingByGithubId = new Map(
      state.connectedRepos
        .filter((repo) => repo.userId === userId)
        .map((repo) => [String(repo.githubRepoId), repo])
    );

    const nextConnected = [];

    for (const repo of repos) {
      const key = String(repo.id);
      const existing = existingByGithubId.get(key);

      if (existing) {
        existing.fullName = repo.full_name;
        existing.name = repo.name;
        existing.owner = repo.owner?.login || existing.owner;
        existing.private = Boolean(repo.private);
        existing.defaultBranch = repo.default_branch || "main";
        existing.autoGenerate = repo.autoGenerate !== false;
        if (existing.lastManualTriggerAt === undefined) {
          existing.lastManualTriggerAt = null;
        }
        if (existing.lastReleaseTag === undefined) {
          existing.lastReleaseTag = null;
        }
        if (existing.lastReleaseTitle === undefined) {
          existing.lastReleaseTitle = null;
        }
        if (existing.lastTriggerStatus === undefined) {
          existing.lastTriggerStatus = null;
        }
        existing.updatedAt = now;
        nextConnected.push(existing);
        continue;
      }

      const created = {
        id: makeId("repo"),
        userId,
        githubRepoId: key,
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner?.login || "",
        private: Boolean(repo.private),
        defaultBranch: repo.default_branch || "main",
        autoGenerate: repo.autoGenerate !== false,
        lastManualTriggerAt: null,
        lastReleaseTag: null,
        lastReleaseTitle: null,
        lastTriggerStatus: null,
        createdAt: now,
        updatedAt: now
      };

      state.connectedRepos.push(created);
      nextConnected.push(created);
    }

    return nextConnected.map((item) => ({ ...item }));
  });
}

export async function toggleRepoAutomation(userId, repoId, autoGenerate) {
  return await withState((state) => {
    const repo = state.connectedRepos.find((item) => item.id === repoId && item.userId === userId);
    if (!repo) {
      throw new Error("Connected repo not found");
    }

    repo.autoGenerate = Boolean(autoGenerate);
    repo.updatedAt = new Date().toISOString();
    return { ...repo };
  });
}

export async function getConnectedRepoById(userId, repoId) {
  const state = await readState();
  const repo = state.connectedRepos.find((item) => item.id === repoId && item.userId === userId);
  return repo ? { ...repo } : null;
}

export async function recordManualTrigger(userId, repoId, payload) {
  const now = new Date().toISOString();

  return await withState((state) => {
    const repo = state.connectedRepos.find((item) => item.id === repoId && item.userId === userId);
    if (!repo) {
      throw new Error("Connected repo not found");
    }

    const run = {
      id: makeId("run"),
      userId,
      repoId,
      repoFullName: repo.fullName,
      status: payload.status || "ok",
      error: payload.error || null,
      release: payload.release || null,
      triggeredAt: now
    };
    state.manualRuns.push(run);

    repo.lastManualTriggerAt = now;
    repo.lastTriggerStatus = run.status;
    repo.lastReleaseTag = run.release?.tag || null;
    repo.lastReleaseTitle = run.release?.title || null;
    repo.updatedAt = now;

    return {
      run: { ...run },
      repo: { ...repo }
    };
  });
}

export async function createDraftFromRun(userId, repoId, runId, options = {}) {
  const snapshot = await readState();
  const repo = snapshot.connectedRepos.find((item) => item.id === repoId && item.userId === userId);
  if (!repo) {
    throw new Error("Connected repo not found for draft generation");
  }

  const run = snapshot.manualRuns.find((item) => item.id === runId && item.userId === userId);
  if (!run || !run.release) {
    throw new Error("Manual run not found for draft generation");
  }

  const user = snapshot.users.find((item) => item.id === userId);
  const resolvedStyle = resolveToneProfileForUser(
    user || null,
    options.writingStyleId || user?.writingStyle || DEFAULT_WRITING_STYLE
  );

  const generated = await generateReleasePack({
    repoFullName: repo.fullName,
    release: run.release,
    writingStyleId: resolvedStyle.id,
    writingStyle: resolvedStyle,
    aiSettings: sanitizeAiSettings(user?.aiSettings)
  });

  const generatedVariants = Array.isArray(generated?.variants) && generated.variants.length >= 3
    ? generated.variants
    : createDraftVariants({
        repoFullName: repo.fullName,
        release: run.release,
        styleId: resolvedStyle.id,
        styleProfile: resolvedStyle
      });

  return await withState((state) => {
    const variants = generatedVariants.map((variant) => ({
      id: makeId("var"),
      type: variant.type,
      text: variant.text
    }));

    const draft = {
      id: makeId("draft"),
      userId,
      repoId,
      runId,
      release: run.release,
      writingStyleId: resolvedStyle.id,
      generationSource: generated?.source || "template_fallback",
      generationStatus: generated?.generationStatus || "error",
      generationModel: generated?.generationModel || null,
      generationError: generated?.generationError || null,
      imageDataUrl: generated?.imageDataUrl || null,
      imagePrompt: generated?.imagePrompt || null,
      selectedVariantId: variants[0]?.id || null,
      variants,
      status: "draft_ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.drafts.push(draft);

    const inboxItem = {
      id: makeId("inbox"),
      userId,
      type: "draft_ready",
      title: `${run.release.title}`,
      body: `${repo.fullName} • ${run.release.tag || "release"} • ${resolvedStyle.label}`,
      draftId: draft.id,
      read: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.inboxItems.push(inboxItem);

    return {
      draft: { ...draft },
      inboxItem: { ...inboxItem }
    };
  });
}

export async function listManualRunsForUser(userId, limit = 20) {
  const state = await readState();
  return state.manualRuns
    .filter((run) => run.userId === userId)
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
    .slice(0, limit)
    .map((run) => ({ ...run }));
}

export async function listInboxItemsPage(userId, input = {}) {
  const rawLimit = Number.isFinite(input?.limit) ? input.limit : Number(input?.limit);
  const rawOffset = Number.isFinite(input?.offset) ? input.offset : Number(input?.offset);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.trunc(rawLimit)))
    : 30;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.trunc(rawOffset))
    : 0;

  const state = await readState();
  const allItems = state.inboxItems
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const items = allItems
    .slice(offset, offset + limit)
    .map((item) => ({ ...item }));
  const total = allItems.length;
  const nextOffset = offset + items.length;

  return {
    items,
    total,
    limit,
    offset,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null
  };
}

export async function listInboxItems(userId, limit = 30) {
  return (await listInboxItemsPage(userId, { limit, offset: 0 })).items;
}

export async function deleteInboxItem(userId, inboxItemId) {
  const targetId = String(inboxItemId || "").trim();
  if (!targetId) {
    throw new Error("Inbox item id is required");
  }

  return await withState((state) => {
    const index = state.inboxItems.findIndex(
      (item) => item.userId === userId && item.id === targetId
    );
    if (index < 0) {
      throw new Error("Inbox item not found");
    }

    const [deleted] = state.inboxItems.splice(index, 1);
    const deletedDraftId = String(deleted?.draftId || "").trim();
    let removedDraft = null;
    let removedLinkedInboxItems = 0;

    if (deletedDraftId) {
      const draftIndex = state.drafts.findIndex(
        (draft) => draft.userId === userId && draft.id === deletedDraftId
      );

      if (draftIndex >= 0) {
        const [draft] = state.drafts.splice(draftIndex, 1);
        removedDraft = { ...draft };
      }

      const before = state.inboxItems.length;
      state.inboxItems = state.inboxItems.filter(
        (item) => !(item.userId === userId && item.draftId === deletedDraftId)
      );
      removedLinkedInboxItems = before - state.inboxItems.length;
    }

    return {
      ...deleted,
      removedDraft,
      removedLinkedInboxItems
    };
  });
}

export async function listDrafts(userId, limit = 30) {
  const state = await readState();
  return state.drafts
    .filter((draft) => draft.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map((draft) => ({ ...draft }));
}

export async function listDraftsPage(userId, input = {}) {
  const rawPage = Number.parseInt(String(input?.page || "1"), 10);
  const rawLimit = Number.parseInt(String(input?.limit || "50"), 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const offset = (page - 1) * limit;

  const state = await readState();
  const allDrafts = state.drafts
    .filter((draft) => draft.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const items = allDrafts.slice(offset, offset + limit).map((draft) => ({ ...draft }));
  const total = allDrafts.length;

  return { items, total, page, limit, hasMore: offset + items.length < total };
}

export async function updateDraft(userId, draftId, input) {
  return await withState((state) => {
    const draft = state.drafts.find((item) => item.id === draftId && item.userId === userId);
    if (!draft) {
      throw new Error("Draft not found");
    }

    const selectedVariantId = String(input.selectedVariantId || "").trim();
    const editedText = typeof input.editedText === "string" ? input.editedText : null;
    const nextStatus = typeof input.status === "string" ? input.status : null;
    const rawImageDataUrl = input.imageDataUrl;
    let shouldUpdateImageDataUrl = false;
    let nextImageDataUrl = null;
    let nextImagePrompt = null;

    if (rawImageDataUrl === null) {
      shouldUpdateImageDataUrl = true;
      nextImageDataUrl = null;
      nextImagePrompt = null;
    } else if (typeof rawImageDataUrl === "string") {
      const trimmedImageDataUrl = rawImageDataUrl.trim();
      shouldUpdateImageDataUrl = true;

      if (!trimmedImageDataUrl) {
        nextImageDataUrl = null;
        nextImagePrompt = null;
      } else {
        const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmedImageDataUrl);
        const isHttpImage = /^https?:\/\/\S+/i.test(trimmedImageDataUrl);
        if (!isDataImage && !isHttpImage) {
          throw new Error("imageDataUrl must be a valid https URL or data:image base64 string");
        }

        if (trimmedImageDataUrl.length > 12_000_000) {
          throw new Error("imageDataUrl is too large");
        }

        nextImageDataUrl = trimmedImageDataUrl;
        nextImagePrompt = isDataImage ? "user_uploaded_image" : "user_provided_image_url";
      }
    }

    if (selectedVariantId) {
      const variant = draft.variants.find((item) => item.id === selectedVariantId);
      if (!variant) {
        throw new Error("Variant not found");
      }
      draft.selectedVariantId = selectedVariantId;
    }

    if (editedText !== null && draft.selectedVariantId) {
      const selected = draft.variants.find((item) => item.id === draft.selectedVariantId);
      if (selected) {
        selected.text = editedText;
      }
    }

    if (nextStatus) {
      draft.status = nextStatus;
    }

    if (shouldUpdateImageDataUrl) {
      draft.imageDataUrl = nextImageDataUrl;
      draft.imagePrompt = nextImagePrompt;
    }

    draft.updatedAt = new Date().toISOString();
    return { ...draft };
  });
}

export function getActiveStorageBackendName() {
  return getStorageBackendName();
}

export function resetStoreBackendForTests() {
  resetStorageBackendForTests();
}
