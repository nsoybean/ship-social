import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { importJsonStateToPostgres } from "../lib/db/import-json.mjs";
import { runMigrations } from "../lib/db/migrations.js";
import { closePostgresPoolForTests, getPostgresPool } from "../lib/db/postgres-client.js";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();

async function truncateAll(pool) {
  await pool.query(`
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
}

async function readTableCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM tone_profiles) AS tone_profiles,
      (SELECT COUNT(*)::int FROM sessions) AS sessions,
      (SELECT COUNT(*)::int FROM connected_repos) AS connected_repos,
      (SELECT COUNT(*)::int FROM manual_runs) AS manual_runs,
      (SELECT COUNT(*)::int FROM drafts) AS drafts,
      (SELECT COUNT(*)::int FROM inbox_items) AS inbox_items
  `);

  return result.rows[0];
}

test(
  "json import is idempotent and reports malformed/dependency skips",
  {
    concurrency: false,
    skip: !testDatabaseUrl
  },
  async () => {
    process.env.DATABASE_URL = testDatabaseUrl;

    await runMigrations();
    const pool = getPostgresPool();
    await truncateAll(pool);

    const now = new Date().toISOString();
    const state = {
      users: [
        {
          id: "usr_1",
          githubId: "100",
          githubLogin: "octocat",
          githubName: "The Octocat",
          avatarUrl: "https://avatars.example.com/octocat",
          writingStyle: "technical",
          accessToken: "gho_test",
          toneProfiles: [
            {
              id: "tone_1",
              label: "Builder Voice",
              description: "Concise and practical",
              rules: "Use concrete outcomes and implementation details.",
              createdAt: now,
              updatedAt: now
            },
            {
              id: "",
              label: "Invalid Tone",
              rules: ""
            }
          ],
          createdAt: now,
          updatedAt: now
        },
        {
          id: "",
          githubId: "",
          githubLogin: "invalid-user"
        }
      ],
      sessions: [
        {
          id: "sess_1",
          token: "session_token_1",
          userId: "usr_1",
          createdAt: now
        },
        {
          id: "sess_2",
          token: "session_token_2",
          userId: "missing_user",
          createdAt: now
        }
      ],
      connectedRepos: [
        {
          id: "repo_1",
          userId: "usr_1",
          githubRepoId: "200",
          fullName: "octocat/ship-social",
          name: "ship-social",
          owner: "octocat",
          private: false,
          defaultBranch: "main",
          autoGenerate: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "repo_2",
          userId: "missing_user",
          githubRepoId: "201",
          fullName: "missing/repo",
          name: "repo",
          owner: "missing",
          createdAt: now,
          updatedAt: now
        }
      ],
      manualRuns: [
        {
          id: "run_1",
          userId: "usr_1",
          repoId: "repo_1",
          repoFullName: "octocat/ship-social",
          status: "ok",
          release: { tag: "v1.0.0", title: "First release" },
          triggeredAt: now
        },
        {
          id: "run_2",
          userId: "usr_1",
          repoId: "missing_repo",
          repoFullName: "octocat/ship-social",
          status: "ok",
          triggeredAt: now
        }
      ],
      drafts: [
        {
          id: "draft_1",
          userId: "usr_1",
          repoId: "repo_1",
          runId: "run_1",
          release: { tag: "v1.0.0", title: "First release" },
          writingStyleId: "tone_1",
          variants: [{ id: "var_1", type: "x", text: "Draft body" }],
          selectedVariantId: "var_1",
          status: "draft_ready",
          createdAt: now,
          updatedAt: now
        },
        {
          id: "draft_2",
          userId: "usr_1",
          repoId: "repo_1",
          runId: "missing_run",
          writingStyleId: "tone_1",
          variants: [],
          createdAt: now,
          updatedAt: now
        }
      ],
      inboxItems: [
        {
          id: "inbox_1",
          userId: "usr_1",
          type: "draft_ready",
          title: "Draft ready",
          body: "octocat/ship-social",
          draftId: "draft_1",
          read: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "inbox_2",
          userId: "missing_user",
          type: "draft_ready",
          title: "Should skip",
          body: "missing",
          createdAt: now,
          updatedAt: now
        }
      ]
    };

    const fixturePath = path.join(os.tmpdir(), `ship-social-import-${Date.now()}-${Math.random()}.json`);
    await fs.writeFile(fixturePath, JSON.stringify(state, null, 2), "utf8");

    try {
      const first = await importJsonStateToPostgres({ inputPath: fixturePath });

      assert.equal(first.sections.users.imported, 1);
      assert.equal(first.sections.users.skippedMalformed, 1);
      assert.equal(first.sections.toneProfiles.imported, 1);
      assert.equal(first.sections.toneProfiles.skippedMalformed, 1);

      assert.equal(first.sections.sessions.imported, 1);
      assert.equal(first.sections.sessions.skippedDependency, 1);
      assert.equal(first.sections.connectedRepos.imported, 1);
      assert.equal(first.sections.connectedRepos.skippedDependency, 1);
      assert.equal(first.sections.manualRuns.imported, 1);
      assert.equal(first.sections.manualRuns.skippedDependency, 1);
      assert.equal(first.sections.drafts.imported, 1);
      assert.equal(first.sections.drafts.skippedDependency, 1);
      assert.equal(first.sections.inboxItems.imported, 1);
      assert.equal(first.sections.inboxItems.skippedDependency, 1);

      const second = await importJsonStateToPostgres({ inputPath: fixturePath });

      assert.equal(second.sections.users.imported, 0);
      assert.equal(second.sections.users.updated, 1);
      assert.equal(second.sections.toneProfiles.imported, 0);
      assert.equal(second.sections.toneProfiles.updated, 1);
      assert.equal(second.sections.sessions.imported, 0);
      assert.equal(second.sections.sessions.updated, 1);
      assert.equal(second.sections.connectedRepos.imported, 0);
      assert.equal(second.sections.connectedRepos.updated, 1);
      assert.equal(second.sections.manualRuns.imported, 0);
      assert.equal(second.sections.manualRuns.updated, 1);
      assert.equal(second.sections.drafts.imported, 0);
      assert.equal(second.sections.drafts.updated, 1);
      assert.equal(second.sections.inboxItems.imported, 0);
      assert.equal(second.sections.inboxItems.updated, 1);

      const counts = await readTableCounts(pool);
      assert.deepEqual(counts, {
        users: 1,
        tone_profiles: 1,
        sessions: 1,
        connected_repos: 1,
        manual_runs: 1,
        drafts: 1,
        inbox_items: 1
      });
    } finally {
      await fs.rm(fixturePath, { force: true });
      await truncateAll(pool);
    }
  }
);

after(async () => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }

  await closePostgresPoolForTests();
});
