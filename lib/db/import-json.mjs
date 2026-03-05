import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const DEFAULT_MIGRATIONS_DIR = "migrations";

const MAX_REPORT_ITEMS = 25;
let cachedPool = null;
let cachedUrl = "";

const SECTION_NAMES = {
  users: "users",
  toneProfiles: "toneProfiles",
  sessions: "sessions",
  connectedRepos: "connectedRepos",
  manualRuns: "manualRuns",
  drafts: "drafts",
  inboxItems: "inboxItems"
};

function defaultState() {
  return {
    users: [],
    sessions: [],
    connectedRepos: [],
    manualRuns: [],
    drafts: [],
    inboxItems: []
  };
}

function sanitizeState(raw) {
  const base = defaultState();
  const value = raw && typeof raw === "object" ? raw : {};

  return {
    users: Array.isArray(value.users) ? value.users : base.users,
    sessions: Array.isArray(value.sessions) ? value.sessions : base.sessions,
    connectedRepos: Array.isArray(value.connectedRepos) ? value.connectedRepos : base.connectedRepos,
    manualRuns: Array.isArray(value.manualRuns) ? value.manualRuns : base.manualRuns,
    drafts: Array.isArray(value.drafts) ? value.drafts : base.drafts,
    inboxItems: Array.isArray(value.inboxItems) ? value.inboxItems : base.inboxItems
  };
}

function getDatabaseUrlOrThrow() {
  const value = String(process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new Error("DATABASE_URL is required to import JSON into Postgres.");
  }
  return value;
}

function getPostgresPool() {
  const databaseUrl = getDatabaseUrlOrThrow();
  if (cachedPool && cachedUrl === databaseUrl) {
    return cachedPool;
  }

  if (cachedPool && cachedUrl !== databaseUrl) {
    void cachedPool.end().catch(() => {});
    cachedPool = null;
  }

  cachedPool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10_000
  });
  cachedUrl = databaseUrl;
  return cachedPool;
}

export async function closeImportPostgresPool() {
  if (!cachedPool) {
    return;
  }

  const activePool = cachedPool;
  cachedPool = null;
  cachedUrl = "";
  await activePool.end();
}

function resolveMigrationsDir(dirPath) {
  if (dirPath) {
    return path.isAbsolute(dirPath)
      ? dirPath
      : path.join(process.cwd(), dirPath);
  }

  return path.join(process.cwd(), DEFAULT_MIGRATIONS_DIR);
}

async function runMigrations(options = {}) {
  const migrationsDir = resolveMigrationsDir(options.dir);
  const pool = getPostgresPool();

  const fileNames = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query("SELECT name FROM _schema_migrations");
    const appliedNames = new Set(appliedResult.rows.map((row) => String(row.name)));

    for (const fileName of fileNames) {
      if (appliedNames.has(fileName)) {
        continue;
      }

      const sqlPath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(sqlPath, "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _schema_migrations (name, applied_at) VALUES ($1, NOW()) ON CONFLICT (name) DO NOTHING",
          [fileName]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

function defaultInputPath() {
  return path.join(process.cwd(), "data", "state.json");
}

function resolveInputPath(inputPath) {
  if (!inputPath) {
    return defaultInputPath();
  }

  return path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);
}

function createSectionReport() {
  return {
    seen: 0,
    imported: 0,
    updated: 0,
    skippedMalformed: 0,
    skippedDependency: 0,
    failed: 0,
    samples: []
  };
}

function addSample(section, sample) {
  if (section.samples.length >= MAX_REPORT_ITEMS) {
    return;
  }

  section.samples.push(sample);
}

function markMalformed(section, sample) {
  section.skippedMalformed += 1;
  addSample(section, { type: "malformed", ...sample });
}

function markDependency(section, sample) {
  section.skippedDependency += 1;
  addSample(section, { type: "dependency", ...sample });
}

function markFailure(section, sample) {
  section.failed += 1;
  addSample(section, { type: "db_error", ...sample });
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function requiredText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim();
}

function optionalNullableText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(trimmed)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(trimmed)) {
      return false;
    }
  }

  return fallback;
}

function toIso(value, { nullable = false } = {}) {
  if (value === null || value === undefined || value === "") {
    return nullable ? null : new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return nullable ? null : new Date().toISOString();
  }

  return date.toISOString();
}

function toJsonValue(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  return value;
}

async function loadIdSet(client, tableName) {
  const result = await client.query(`SELECT id FROM ${tableName}`);
  return new Set(result.rows.map((row) => String(row.id)));
}

async function upsertWithIdSet({
  client,
  section,
  id,
  idSet,
  query,
  values,
  sample
}) {
  const existsAlready = idSet.has(id);

  try {
    await client.query(query, values);
  } catch (error) {
    markFailure(section, {
      ...sample,
      reason: error instanceof Error ? error.message : String(error)
    });
    return false;
  }

  if (existsAlready) {
    section.updated += 1;
  } else {
    section.imported += 1;
    idSet.add(id);
  }

  return true;
}

function validateStateShapeWarnings(rawState) {
  const warnings = [];
  const expectedArrays = [
    SECTION_NAMES.users,
    SECTION_NAMES.sessions,
    SECTION_NAMES.connectedRepos,
    SECTION_NAMES.manualRuns,
    SECTION_NAMES.drafts,
    SECTION_NAMES.inboxItems
  ];

  for (const key of expectedArrays) {
    if (!Array.isArray(rawState?.[key])) {
      warnings.push(
        `Input key '${key}' is missing or not an array. Defaulting to an empty list for import.`
      );
    }
  }

  return warnings;
}

function withTotals(report) {
  const totals = {
    seen: 0,
    imported: 0,
    updated: 0,
    skippedMalformed: 0,
    skippedDependency: 0,
    failed: 0
  };

  for (const section of Object.values(report.sections)) {
    totals.seen += section.seen;
    totals.imported += section.imported;
    totals.updated += section.updated;
    totals.skippedMalformed += section.skippedMalformed;
    totals.skippedDependency += section.skippedDependency;
    totals.failed += section.failed;
  }

  return {
    ...report,
    totals
  };
}

export async function importJsonStateToPostgres(options = {}) {
  const startedAt = new Date();
  const sourcePath = resolveInputPath(options.inputPath);

  const rawText = await fs.readFile(sourcePath, "utf8");
  const parsed = JSON.parse(rawText);
  const rawState = asObject(parsed);

  if (!rawState) {
    throw new Error("Input file must contain a JSON object with state arrays.");
  }

  const state = sanitizeState(rawState);
  const report = {
    sourcePath,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: 0,
    warnings: validateStateShapeWarnings(rawState),
    sections: {
      users: createSectionReport(),
      toneProfiles: createSectionReport(),
      sessions: createSectionReport(),
      connectedRepos: createSectionReport(),
      manualRuns: createSectionReport(),
      drafts: createSectionReport(),
      inboxItems: createSectionReport()
    }
  };

  await runMigrations();

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    const userIds = await loadIdSet(client, "users");
    const toneProfileIds = await loadIdSet(client, "tone_profiles");
    const sessionIds = await loadIdSet(client, "sessions");
    const repoIds = await loadIdSet(client, "connected_repos");
    const runIds = await loadIdSet(client, "manual_runs");
    const draftIds = await loadIdSet(client, "drafts");
    const inboxItemIds = await loadIdSet(client, "inbox_items");

    for (let index = 0; index < state.users.length; index += 1) {
      const section = report.sections.users;
      section.seen += 1;

      const rawUser = asObject(state.users[index]);
      if (!rawUser) {
        markMalformed(section, { index, reason: "User record is not an object." });
        continue;
      }

      const id = requiredText(rawUser.id);
      const githubId = requiredText(rawUser.githubId);
      if (!id || !githubId) {
        markMalformed(section, {
          index,
          id: id || null,
          reason: "User requires non-empty id and githubId fields."
        });
        continue;
      }

      const importedUser = await upsertWithIdSet({
        client,
        section,
        id,
        idSet: userIds,
        sample: { index, id },
        query: `
          INSERT INTO users (
            id,
            github_id,
            github_login,
            github_name,
            avatar_url,
            writing_style,
            access_token,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            github_id = EXCLUDED.github_id,
            github_login = EXCLUDED.github_login,
            github_name = EXCLUDED.github_name,
            avatar_url = EXCLUDED.avatar_url,
            writing_style = EXCLUDED.writing_style,
            access_token = EXCLUDED.access_token,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        values: [
          id,
          githubId,
          optionalText(rawUser.githubLogin),
          optionalText(rawUser.githubName),
          optionalText(rawUser.avatarUrl),
          optionalText(rawUser.writingStyle, "technical"),
          optionalText(rawUser.accessToken),
          toIso(rawUser.createdAt),
          toIso(rawUser.updatedAt)
        ]
      });

      if (!importedUser) {
        continue;
      }

      const toneProfiles = Array.isArray(rawUser.toneProfiles)
        ? rawUser.toneProfiles
        : [];

      if (rawUser.toneProfiles !== undefined && !Array.isArray(rawUser.toneProfiles)) {
        report.warnings.push(`User '${id}' has non-array toneProfiles; skipping tone profile import for that user.`);
      }

      for (let toneIndex = 0; toneIndex < toneProfiles.length; toneIndex += 1) {
        const toneSection = report.sections.toneProfiles;
        toneSection.seen += 1;

        const rawTone = asObject(toneProfiles[toneIndex]);
        if (!rawTone) {
          markMalformed(toneSection, {
            index: `${index}:${toneIndex}`,
            reason: "Tone profile is not an object."
          });
          continue;
        }

        const toneId = requiredText(rawTone.id);
        const label = requiredText(rawTone.label);
        const rules = requiredText(rawTone.rules);
        if (!toneId || !label || !rules) {
          markMalformed(toneSection, {
            index: `${index}:${toneIndex}`,
            id: toneId || null,
            reason: "Tone profile requires non-empty id, label, and rules."
          });
          continue;
        }

        await upsertWithIdSet({
          client,
          section: toneSection,
          id: toneId,
          idSet: toneProfileIds,
          sample: { index: `${index}:${toneIndex}`, id: toneId, userId: id },
          query: `
            INSERT INTO tone_profiles (
              id,
              user_id,
              label,
              description,
              rules,
              is_preset,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              label = EXCLUDED.label,
              description = EXCLUDED.description,
              rules = EXCLUDED.rules,
              is_preset = EXCLUDED.is_preset,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at
          `,
          values: [
            toneId,
            id,
            label,
            optionalText(rawTone.description),
            rules,
            false,
            toIso(rawTone.createdAt),
            toIso(rawTone.updatedAt)
          ]
        });
      }
    }

    for (let index = 0; index < state.sessions.length; index += 1) {
      const section = report.sections.sessions;
      section.seen += 1;

      const rawSession = asObject(state.sessions[index]);
      if (!rawSession) {
        markMalformed(section, { index, reason: "Session record is not an object." });
        continue;
      }

      const id = requiredText(rawSession.id);
      const token = requiredText(rawSession.token);
      const userId = requiredText(rawSession.userId);
      if (!id || !token || !userId) {
        markMalformed(section, {
          index,
          id: id || null,
          reason: "Session requires non-empty id, token, and userId fields."
        });
        continue;
      }

      if (!userIds.has(userId)) {
        markDependency(section, {
          index,
          id,
          reason: `Session user '${userId}' does not exist.`
        });
        continue;
      }

      await upsertWithIdSet({
        client,
        section,
        id,
        idSet: sessionIds,
        sample: { index, id, userId },
        query: `
          INSERT INTO sessions (id, token, user_id, created_at)
          VALUES ($1, $2, $3, $4::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            token = EXCLUDED.token,
            user_id = EXCLUDED.user_id,
            created_at = EXCLUDED.created_at
        `,
        values: [id, token, userId, toIso(rawSession.createdAt)]
      });
    }

    for (let index = 0; index < state.connectedRepos.length; index += 1) {
      const section = report.sections.connectedRepos;
      section.seen += 1;

      const rawRepo = asObject(state.connectedRepos[index]);
      if (!rawRepo) {
        markMalformed(section, { index, reason: "Connected repo record is not an object." });
        continue;
      }

      const id = requiredText(rawRepo.id);
      const userId = requiredText(rawRepo.userId);
      const githubRepoId = requiredText(rawRepo.githubRepoId);
      const fullName = requiredText(rawRepo.fullName);
      const name = requiredText(rawRepo.name);
      const owner = requiredText(rawRepo.owner);

      if (!id || !userId || !githubRepoId || !fullName || !name || !owner) {
        markMalformed(section, {
          index,
          id: id || null,
          reason:
            "Connected repo requires non-empty id, userId, githubRepoId, fullName, name, and owner fields."
        });
        continue;
      }

      if (!userIds.has(userId)) {
        markDependency(section, {
          index,
          id,
          reason: `Repo user '${userId}' does not exist.`
        });
        continue;
      }

      await upsertWithIdSet({
        client,
        section,
        id,
        idSet: repoIds,
        sample: { index, id, userId },
        query: `
          INSERT INTO connected_repos (
            id,
            user_id,
            github_repo_id,
            full_name,
            name,
            owner,
            is_private,
            default_branch,
            auto_generate,
            last_manual_trigger_at,
            last_release_tag,
            last_release_title,
            last_trigger_status,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10::timestamptz, $11, $12, $13, $14::timestamptz, $15::timestamptz
          )
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            github_repo_id = EXCLUDED.github_repo_id,
            full_name = EXCLUDED.full_name,
            name = EXCLUDED.name,
            owner = EXCLUDED.owner,
            is_private = EXCLUDED.is_private,
            default_branch = EXCLUDED.default_branch,
            auto_generate = EXCLUDED.auto_generate,
            last_manual_trigger_at = EXCLUDED.last_manual_trigger_at,
            last_release_tag = EXCLUDED.last_release_tag,
            last_release_title = EXCLUDED.last_release_title,
            last_trigger_status = EXCLUDED.last_trigger_status,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        values: [
          id,
          userId,
          githubRepoId,
          fullName,
          name,
          owner,
          toBoolean(rawRepo.private, false),
          optionalText(rawRepo.defaultBranch, "main"),
          toBoolean(rawRepo.autoGenerate, true),
          toIso(rawRepo.lastManualTriggerAt, { nullable: true }),
          optionalNullableText(rawRepo.lastReleaseTag),
          optionalNullableText(rawRepo.lastReleaseTitle),
          optionalNullableText(rawRepo.lastTriggerStatus),
          toIso(rawRepo.createdAt),
          toIso(rawRepo.updatedAt)
        ]
      });
    }

    for (let index = 0; index < state.manualRuns.length; index += 1) {
      const section = report.sections.manualRuns;
      section.seen += 1;

      const rawRun = asObject(state.manualRuns[index]);
      if (!rawRun) {
        markMalformed(section, { index, reason: "Manual run record is not an object." });
        continue;
      }

      const id = requiredText(rawRun.id);
      const userId = requiredText(rawRun.userId);
      const repoId = requiredText(rawRun.repoId);
      const repoFullName = requiredText(rawRun.repoFullName);
      const status = requiredText(rawRun.status);
      if (!id || !userId || !repoId || !repoFullName || !status) {
        markMalformed(section, {
          index,
          id: id || null,
          reason:
            "Manual run requires non-empty id, userId, repoId, repoFullName, and status fields."
        });
        continue;
      }

      if (!userIds.has(userId)) {
        markDependency(section, {
          index,
          id,
          reason: `Manual run user '${userId}' does not exist.`
        });
        continue;
      }

      if (!repoIds.has(repoId)) {
        markDependency(section, {
          index,
          id,
          reason: `Manual run repo '${repoId}' does not exist.`
        });
        continue;
      }

      await upsertWithIdSet({
        client,
        section,
        id,
        idSet: runIds,
        sample: { index, id, userId, repoId },
        query: `
          INSERT INTO manual_runs (
            id,
            user_id,
            repo_id,
            repo_full_name,
            status,
            error,
            release,
            triggered_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            repo_id = EXCLUDED.repo_id,
            repo_full_name = EXCLUDED.repo_full_name,
            status = EXCLUDED.status,
            error = EXCLUDED.error,
            release = EXCLUDED.release,
            triggered_at = EXCLUDED.triggered_at
        `,
        values: [
          id,
          userId,
          repoId,
          repoFullName,
          status,
          optionalNullableText(rawRun.error),
          JSON.stringify(toJsonValue(rawRun.release, null)),
          toIso(rawRun.triggeredAt)
        ]
      });
    }

    for (let index = 0; index < state.drafts.length; index += 1) {
      const section = report.sections.drafts;
      section.seen += 1;

      const rawDraft = asObject(state.drafts[index]);
      if (!rawDraft) {
        markMalformed(section, { index, reason: "Draft record is not an object." });
        continue;
      }

      const id = requiredText(rawDraft.id);
      const userId = requiredText(rawDraft.userId);
      const repoId = requiredText(rawDraft.repoId);
      const runId = requiredText(rawDraft.runId);
      if (!id || !userId || !repoId || !runId) {
        markMalformed(section, {
          index,
          id: id || null,
          reason: "Draft requires non-empty id, userId, repoId, and runId fields."
        });
        continue;
      }

      if (!userIds.has(userId)) {
        markDependency(section, {
          index,
          id,
          reason: `Draft user '${userId}' does not exist.`
        });
        continue;
      }

      if (!repoIds.has(repoId)) {
        markDependency(section, {
          index,
          id,
          reason: `Draft repo '${repoId}' does not exist.`
        });
        continue;
      }

      if (!runIds.has(runId)) {
        markDependency(section, {
          index,
          id,
          reason: `Draft run '${runId}' does not exist.`
        });
        continue;
      }

      await upsertWithIdSet({
        client,
        section,
        id,
        idSet: draftIds,
        sample: { index, id, userId, repoId, runId },
        query: `
          INSERT INTO drafts (
            id,
            user_id,
            repo_id,
            run_id,
            release,
            writing_style_id,
            generation_source,
            generation_status,
            generation_model,
            generation_error,
            image_data_url,
            image_prompt,
            selected_variant_id,
            variants,
            status,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5::jsonb,
            $6, $7, $8, $9, $10,
            $11, $12, $13,
            $14::jsonb,
            $15,
            $16::timestamptz,
            $17::timestamptz
          )
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            repo_id = EXCLUDED.repo_id,
            run_id = EXCLUDED.run_id,
            release = EXCLUDED.release,
            writing_style_id = EXCLUDED.writing_style_id,
            generation_source = EXCLUDED.generation_source,
            generation_status = EXCLUDED.generation_status,
            generation_model = EXCLUDED.generation_model,
            generation_error = EXCLUDED.generation_error,
            image_data_url = EXCLUDED.image_data_url,
            image_prompt = EXCLUDED.image_prompt,
            selected_variant_id = EXCLUDED.selected_variant_id,
            variants = EXCLUDED.variants,
            status = EXCLUDED.status,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        values: [
          id,
          userId,
          repoId,
          runId,
          JSON.stringify(toJsonValue(rawDraft.release, null)),
          optionalText(rawDraft.writingStyleId),
          optionalNullableText(rawDraft.generationSource),
          optionalNullableText(rawDraft.generationStatus),
          optionalNullableText(rawDraft.generationModel),
          optionalNullableText(rawDraft.generationError),
          optionalNullableText(rawDraft.imageDataUrl),
          optionalNullableText(rawDraft.imagePrompt),
          optionalNullableText(rawDraft.selectedVariantId),
          JSON.stringify(Array.isArray(rawDraft.variants) ? rawDraft.variants : []),
          optionalNullableText(rawDraft.status),
          toIso(rawDraft.createdAt),
          toIso(rawDraft.updatedAt)
        ]
      });
    }

    for (let index = 0; index < state.inboxItems.length; index += 1) {
      const section = report.sections.inboxItems;
      section.seen += 1;

      const rawInbox = asObject(state.inboxItems[index]);
      if (!rawInbox) {
        markMalformed(section, { index, reason: "Inbox item record is not an object." });
        continue;
      }

      const id = requiredText(rawInbox.id);
      const userId = requiredText(rawInbox.userId);
      const type = requiredText(rawInbox.type);
      const title = requiredText(rawInbox.title);

      if (!id || !userId || !type || !title) {
        markMalformed(section, {
          index,
          id: id || null,
          reason: "Inbox item requires non-empty id, userId, type, and title fields."
        });
        continue;
      }

      if (!userIds.has(userId)) {
        markDependency(section, {
          index,
          id,
          reason: `Inbox user '${userId}' does not exist.`
        });
        continue;
      }

      const draftId = optionalNullableText(rawInbox.draftId);
      if (draftId && !draftIds.has(draftId)) {
        markDependency(section, {
          index,
          id,
          reason: `Inbox draft '${draftId}' does not exist.`
        });
        continue;
      }

      await upsertWithIdSet({
        client,
        section,
        id,
        idSet: inboxItemIds,
        sample: { index, id, userId },
        query: `
          INSERT INTO inbox_items (
            id,
            user_id,
            type,
            title,
            body,
            draft_id,
            is_read,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            draft_id = EXCLUDED.draft_id,
            is_read = EXCLUDED.is_read,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        values: [
          id,
          userId,
          type,
          title,
          optionalText(rawInbox.body),
          draftId,
          toBoolean(rawInbox.read, false),
          toIso(rawInbox.createdAt),
          toIso(rawInbox.updatedAt)
        ]
      });
    }
  } finally {
    client.release();
  }

  const finishedAt = new Date();

  report.finishedAt = finishedAt.toISOString();
  report.durationMs = finishedAt.getTime() - startedAt.getTime();

  return withTotals(report);
}
