import { Pool } from "pg";

const GLOBAL_POOL_KEY = Symbol.for("ship-social.pg-pool");

function getGlobalStore() {
  const target = globalThis;
  if (!target[GLOBAL_POOL_KEY]) {
    target[GLOBAL_POOL_KEY] = { pool: null, url: "" };
  }

  return target[GLOBAL_POOL_KEY];
}

export function hasDatabaseUrl() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function getDatabaseUrlOrThrow() {
  const value = String(process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new Error("DATABASE_URL is required for postgres storage backend");
  }

  return value;
}

export function getPostgresPool() {
  const store = getGlobalStore();
  const url = getDatabaseUrlOrThrow();

  if (store.pool && store.url === url) {
    return store.pool;
  }

  if (store.pool && store.url !== url) {
    void store.pool.end().catch(() => {});
    store.pool = null;
  }

  store.pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 10_000
  });
  store.url = url;

  return store.pool;
}

export async function withPostgresTransaction(fn) {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgresPoolForTests() {
  const store = getGlobalStore();
  if (store.pool) {
    await store.pool.end();
    store.pool = null;
    store.url = "";
  }
}
