import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  clearSession,
  connectSelectedRepos,
  createSession,
  createUserToneProfile,
  deleteInboxItem,
  getActiveStorageBackendName,
  getUserBySessionToken,
  getUserWritingPreference,
  listConnectedReposPage,
  listDraftsPage,
  listInboxItemsPage,
  readState,
  recordManualTrigger,
  resetStoreBackendForTests,
  updateDraft,
  updateUserWritingPreference,
  upsertGithubUser,
  writeState
} from "../lib/store.js";
import { closePostgresPoolForTests } from "../lib/db/postgres-client.js";

const ORIGINAL_ENV = {
  STORAGE_BACKEND: process.env.STORAGE_BACKEND,
  DATABASE_URL: process.env.DATABASE_URL
};

function emptyState() {
  return {
    users: [],
    sessions: [],
    connectedRepos: [],
    manualRuns: [],
    drafts: [],
    inboxItems: []
  };
}

async function configureBackend({ backend, databaseUrl }) {
  process.env.STORAGE_BACKEND = backend;
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }

  resetStoreBackendForTests();
}

async function runCoreParityFlow() {
  await writeState(emptyState());

  const user = await upsertGithubUser(
    {
      id: 42,
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.example.com/octocat"
    },
    "gho_test_token"
  );

  const session = await createSession(user.id);
  const sessionUser = await getUserBySessionToken(session.token);
  assert.equal(sessionUser?.id, user.id);
  assert.equal(sessionUser?.githubLogin, "octocat");

  const basePreference = await getUserWritingPreference(user.id);
  assert.equal(typeof basePreference.writingStyle, "string");
  assert.ok(Array.isArray(basePreference.writingStyles));

  const createdProfile = await createUserToneProfile(user.id, {
    label: "Builder Voice",
    description: "Concise and practical.",
    rules: "Be concise, specific, and actionable with outcomes and user impact."
  });
  assert.equal(createdProfile.mode, "created");

  const selected = await updateUserWritingPreference(user.id, createdProfile.createdToneProfile.id);
  assert.equal(selected.writingStyle, createdProfile.createdToneProfile.id);

  const connected = await connectSelectedRepos(user.id, [
    {
      id: "123",
      full_name: "octocat/ship-social",
      name: "ship-social",
      private: false,
      default_branch: "main",
      owner: { login: "octocat" },
      autoGenerate: true
    }
  ]);

  assert.equal(connected.length, 1);

  const reposPage = await listConnectedReposPage(user.id, { page: 1, limit: 10 });
  assert.equal(reposPage.total, 1);

  const manualRun = await recordManualTrigger(user.id, connected[0].id, {
    status: "ok",
    release: {
      tag: "v1.0.0",
      title: "First release",
      url: "https://example.com/releases/v1"
    }
  });
  assert.equal(manualRun.run.status, "ok");

  const state = await readState();
  state.drafts.push({
    id: "draft_1",
    userId: user.id,
    repoId: connected[0].id,
    runId: manualRun.run.id,
    release: manualRun.run.release,
    writingStyleId: createdProfile.createdToneProfile.id,
    generationSource: "template_fallback",
    generationStatus: "ok",
    generationModel: null,
    generationError: null,
    imageDataUrl: null,
    imagePrompt: null,
    selectedVariantId: "var_1",
    variants: [
      { id: "var_1", type: "x", text: "Initial draft text" },
      { id: "var_2", type: "linkedin", text: "Alt draft text" }
    ],
    status: "draft_ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  state.inboxItems.push({
    id: "inbox_1",
    userId: user.id,
    type: "draft_ready",
    title: "First release",
    body: "octocat/ship-social",
    draftId: "draft_1",
    read: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await writeState(state);

  const draftsPage = await listDraftsPage(user.id, { page: 1, limit: 10 });
  assert.equal(draftsPage.total, 1);

  const updatedDraft = await updateDraft(user.id, "draft_1", {
    selectedVariantId: "var_1",
    editedText: "Edited draft text",
    status: "approved"
  });
  assert.equal(updatedDraft.status, "approved");
  assert.equal(
    updatedDraft.variants.find((item) => item.id === "var_1")?.text,
    "Edited draft text"
  );

  const inboxPage = await listInboxItemsPage(user.id, { limit: 10, offset: 0 });
  assert.equal(inboxPage.total, 1);

  const deleted = await deleteInboxItem(user.id, "inbox_1");
  assert.equal(deleted.id, "inbox_1");

  await clearSession(session.token);
  const clearedSessionUser = await getUserBySessionToken(session.token);
  assert.equal(clearedSessionUser, null);
}

const testDatabaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();

test(
  "postgres backend parity flow",
  {
    concurrency: false,
    skip: !testDatabaseUrl
  },
  async () => {
    await configureBackend({ backend: "postgres", databaseUrl: testDatabaseUrl });
    assert.equal(getActiveStorageBackendName(), "postgres");

    await runCoreParityFlow();
  }
);

after(async () => {
  if (ORIGINAL_ENV.STORAGE_BACKEND === undefined) {
    delete process.env.STORAGE_BACKEND;
  } else {
    process.env.STORAGE_BACKEND = ORIGINAL_ENV.STORAGE_BACKEND;
  }

  if (ORIGINAL_ENV.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
  }

  resetStoreBackendForTests();
  await closePostgresPoolForTests();
});
