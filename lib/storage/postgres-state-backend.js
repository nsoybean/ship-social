import { getPostgresPool, withPostgresTransaction } from "../db/postgres-client";
import { runMigrations } from "../db/migrations";
import { sanitizeState } from "./state-shape";

let migrationsReadyPromise = null;
let migrationsDatabaseUrl = "";

async function ensureMigrations() {
  const currentUrl = String(process.env.DATABASE_URL || "").trim();
  if (!migrationsReadyPromise || migrationsDatabaseUrl !== currentUrl) {
    migrationsDatabaseUrl = currentUrl;
    migrationsReadyPromise = runMigrations();
  }

  return migrationsReadyPromise;
}

function toIso(value, fallback = null) {
  if (!value) return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function asJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return value;
}

function normalizeToneProfiles(rawToneProfiles) {
  if (!Array.isArray(rawToneProfiles)) return [];

  return rawToneProfiles
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const id = String(item.id || "").trim();
      const label = String(item.label || "").trim();
      const rules = String(item.rules || "").trim();
      const description = String(item.description || "").trim();

      if (!id || !label || !rules) return null;

      return {
        id,
        label,
        description,
        rules,
        isPreset: false,
        createdAt: toIso(item.createdAt, new Date().toISOString()),
        updatedAt: toIso(item.updatedAt, new Date().toISOString())
      };
    })
    .filter(Boolean);
}

export async function readState() {
  await ensureMigrations();
  const pool = getPostgresPool();

  const [
    usersResult,
    sessionsResult,
    reposResult,
    manualRunsResult,
    draftsResult,
    inboxResult,
    toneProfilesResult
  ] = await Promise.all([
    pool.query(`
      SELECT
        id,
        github_id,
        github_login,
        github_name,
        avatar_url,
        writing_style,
        access_token,
        created_at,
        updated_at
      FROM users
    `),
    pool.query(`
      SELECT id, token, user_id, created_at
      FROM sessions
    `),
    pool.query(`
      SELECT
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
      FROM connected_repos
    `),
    pool.query(`
      SELECT
        id,
        user_id,
        repo_id,
        repo_full_name,
        status,
        error,
        release,
        triggered_at
      FROM manual_runs
    `),
    pool.query(`
      SELECT
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
      FROM drafts
    `),
    pool.query(`
      SELECT
        id,
        user_id,
        type,
        title,
        body,
        draft_id,
        is_read,
        created_at,
        updated_at
      FROM inbox_items
    `),
    pool.query(`
      SELECT
        id,
        user_id,
        label,
        description,
        rules,
        is_preset,
        created_at,
        updated_at
      FROM tone_profiles
      ORDER BY created_at ASC
    `)
  ]);

  const toneProfilesByUserId = new Map();
  for (const row of toneProfilesResult.rows) {
    const userId = String(row.user_id || "");
    if (!userId) continue;

    if (!toneProfilesByUserId.has(userId)) {
      toneProfilesByUserId.set(userId, []);
    }

    toneProfilesByUserId.get(userId).push({
      id: String(row.id || "").trim(),
      label: String(row.label || "").trim(),
      description: String(row.description || ""),
      rules: String(row.rules || ""),
      isPreset: Boolean(row.is_preset)
    });
  }

  return sanitizeState({
    users: usersResult.rows.map((row) => ({
      id: String(row.id || ""),
      githubId: String(row.github_id || ""),
      githubLogin: String(row.github_login || ""),
      githubName: String(row.github_name || ""),
      avatarUrl: String(row.avatar_url || ""),
      writingStyle: String(row.writing_style || ""),
      toneProfiles: toneProfilesByUserId.get(String(row.id || "")) || [],
      accessToken: String(row.access_token || ""),
      createdAt: toIso(row.created_at, new Date().toISOString()),
      updatedAt: toIso(row.updated_at, new Date().toISOString())
    })),
    sessions: sessionsResult.rows.map((row) => ({
      id: String(row.id || ""),
      token: String(row.token || ""),
      userId: String(row.user_id || ""),
      createdAt: toIso(row.created_at, new Date().toISOString())
    })),
    connectedRepos: reposResult.rows.map((row) => ({
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      githubRepoId: String(row.github_repo_id || ""),
      fullName: String(row.full_name || ""),
      name: String(row.name || ""),
      owner: String(row.owner || ""),
      private: Boolean(row.is_private),
      defaultBranch: String(row.default_branch || "main"),
      autoGenerate: Boolean(row.auto_generate),
      lastManualTriggerAt: toIso(row.last_manual_trigger_at, null),
      lastReleaseTag: row.last_release_tag ? String(row.last_release_tag) : null,
      lastReleaseTitle: row.last_release_title ? String(row.last_release_title) : null,
      lastTriggerStatus: row.last_trigger_status ? String(row.last_trigger_status) : null,
      createdAt: toIso(row.created_at, new Date().toISOString()),
      updatedAt: toIso(row.updated_at, new Date().toISOString())
    })),
    manualRuns: manualRunsResult.rows.map((row) => ({
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      repoId: String(row.repo_id || ""),
      repoFullName: String(row.repo_full_name || ""),
      status: String(row.status || ""),
      error: row.error ? String(row.error) : null,
      release: asJson(row.release, null),
      triggeredAt: toIso(row.triggered_at, new Date().toISOString())
    })),
    drafts: draftsResult.rows.map((row) => ({
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      repoId: String(row.repo_id || ""),
      runId: String(row.run_id || ""),
      release: asJson(row.release, null),
      writingStyleId: String(row.writing_style_id || ""),
      generationSource: row.generation_source ? String(row.generation_source) : null,
      generationStatus: row.generation_status ? String(row.generation_status) : null,
      generationModel: row.generation_model ? String(row.generation_model) : null,
      generationError: row.generation_error ? String(row.generation_error) : null,
      imageDataUrl: row.image_data_url ? String(row.image_data_url) : null,
      imagePrompt: row.image_prompt ? String(row.image_prompt) : null,
      selectedVariantId: row.selected_variant_id ? String(row.selected_variant_id) : null,
      variants: asJson(row.variants, []),
      status: row.status ? String(row.status) : null,
      createdAt: toIso(row.created_at, new Date().toISOString()),
      updatedAt: toIso(row.updated_at, new Date().toISOString())
    })),
    inboxItems: inboxResult.rows.map((row) => ({
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      type: String(row.type || ""),
      title: String(row.title || ""),
      body: String(row.body || ""),
      draftId: row.draft_id ? String(row.draft_id) : null,
      read: Boolean(row.is_read),
      createdAt: toIso(row.created_at, new Date().toISOString()),
      updatedAt: toIso(row.updated_at, new Date().toISOString())
    }))
  });
}

export async function writeState(next) {
  await ensureMigrations();
  const state = sanitizeState(next);

  await withPostgresTransaction(async (client) => {
    await client.query(`
      TRUNCATE TABLE
        tone_profiles,
        inbox_items,
        drafts,
        manual_runs,
        connected_repos,
        sessions,
        users
      RESTART IDENTITY CASCADE
    `);

    for (const user of state.users) {
      const userId = String(user.id || "").trim();
      if (!userId) continue;

      await client.query(
        `
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
        `,
        [
          userId,
          String(user.githubId || ""),
          String(user.githubLogin || ""),
          String(user.githubName || ""),
          String(user.avatarUrl || ""),
          String(user.writingStyle || ""),
          String(user.accessToken || ""),
          toIso(user.createdAt, new Date().toISOString()),
          toIso(user.updatedAt, new Date().toISOString())
        ]
      );

      const toneProfiles = normalizeToneProfiles(user.toneProfiles);
      for (const toneProfile of toneProfiles) {
        await client.query(
          `
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
          `,
          [
            toneProfile.id,
            userId,
            toneProfile.label,
            toneProfile.description,
            toneProfile.rules,
            false,
            toneProfile.createdAt,
            toneProfile.updatedAt
          ]
        );
      }
    }

    for (const session of state.sessions) {
      const id = String(session.id || "").trim();
      const token = String(session.token || "").trim();
      const userId = String(session.userId || "").trim();
      if (!id || !token || !userId) continue;

      await client.query(
        `
          INSERT INTO sessions (id, token, user_id, created_at)
          VALUES ($1, $2, $3, $4::timestamptz)
        `,
        [id, token, userId, toIso(session.createdAt, new Date().toISOString())]
      );
    }

    for (const repo of state.connectedRepos) {
      const id = String(repo.id || "").trim();
      const userId = String(repo.userId || "").trim();
      if (!id || !userId) continue;

      await client.query(
        `
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
        `,
        [
          id,
          userId,
          String(repo.githubRepoId || ""),
          String(repo.fullName || ""),
          String(repo.name || ""),
          String(repo.owner || ""),
          Boolean(repo.private),
          String(repo.defaultBranch || "main"),
          repo.autoGenerate !== false,
          toIso(repo.lastManualTriggerAt, null),
          repo.lastReleaseTag ? String(repo.lastReleaseTag) : null,
          repo.lastReleaseTitle ? String(repo.lastReleaseTitle) : null,
          repo.lastTriggerStatus ? String(repo.lastTriggerStatus) : null,
          toIso(repo.createdAt, new Date().toISOString()),
          toIso(repo.updatedAt, new Date().toISOString())
        ]
      );
    }

    for (const run of state.manualRuns) {
      const id = String(run.id || "").trim();
      const userId = String(run.userId || "").trim();
      const repoId = String(run.repoId || "").trim();
      if (!id || !userId || !repoId) continue;

      await client.query(
        `
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
        `,
        [
          id,
          userId,
          repoId,
          String(run.repoFullName || ""),
          String(run.status || "ok"),
          run.error ? String(run.error) : null,
          JSON.stringify(run.release || null),
          toIso(run.triggeredAt, new Date().toISOString())
        ]
      );
    }

    for (const draft of state.drafts) {
      const id = String(draft.id || "").trim();
      const userId = String(draft.userId || "").trim();
      const repoId = String(draft.repoId || "").trim();
      const runId = String(draft.runId || "").trim();
      if (!id || !userId || !repoId || !runId) continue;

      await client.query(
        `
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
        `,
        [
          id,
          userId,
          repoId,
          runId,
          JSON.stringify(draft.release || null),
          String(draft.writingStyleId || ""),
          draft.generationSource ? String(draft.generationSource) : null,
          draft.generationStatus ? String(draft.generationStatus) : null,
          draft.generationModel ? String(draft.generationModel) : null,
          draft.generationError ? String(draft.generationError) : null,
          draft.imageDataUrl ? String(draft.imageDataUrl) : null,
          draft.imagePrompt ? String(draft.imagePrompt) : null,
          draft.selectedVariantId ? String(draft.selectedVariantId) : null,
          JSON.stringify(Array.isArray(draft.variants) ? draft.variants : []),
          draft.status ? String(draft.status) : null,
          toIso(draft.createdAt, new Date().toISOString()),
          toIso(draft.updatedAt, new Date().toISOString())
        ]
      );
    }

    for (const item of state.inboxItems) {
      const id = String(item.id || "").trim();
      const userId = String(item.userId || "").trim();
      if (!id || !userId) continue;

      await client.query(
        `
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
        `,
        [
          id,
          userId,
          String(item.type || ""),
          String(item.title || ""),
          String(item.body || ""),
          item.draftId ? String(item.draftId) : null,
          Boolean(item.read),
          toIso(item.createdAt, new Date().toISOString()),
          toIso(item.updatedAt, new Date().toISOString())
        ]
      );
    }
  });
}
