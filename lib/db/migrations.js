import fs from "node:fs/promises";
import path from "node:path";
import { getPostgresPool, withPostgresTransaction } from "./postgres-client.js";

function resolveMigrationsDir(dirPath) {
  if (dirPath) {
    return path.isAbsolute(dirPath)
      ? dirPath
      : path.join(process.cwd(), dirPath);
  }

  return path.join(process.cwd(), "migrations");
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(options = {}) {
  const migrationsDir = resolveMigrationsDir(options.dir);
  const pool = getPostgresPool();

  const fileNames = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const applied = await withPostgresTransaction(async (client) => {
    await ensureMigrationTable(client);
    const result = await client.query("SELECT name FROM _schema_migrations");
    return new Set(result.rows.map((row) => String(row.name)));
  });

  const appliedNow = [];

  for (const fileName of fileNames) {
    if (applied.has(fileName)) {
      continue;
    }

    const sqlPath = path.join(migrationsDir, fileName);
    const sql = await fs.readFile(sqlPath, "utf8");

    await withPostgresTransaction(async (client) => {
      await ensureMigrationTable(client);
      await client.query(sql);
      await client.query(
        "INSERT INTO _schema_migrations (name, applied_at) VALUES ($1, NOW()) ON CONFLICT (name) DO NOTHING",
        [fileName]
      );
    });

    appliedNow.push(fileName);
  }

  const result = await pool.query("SELECT name, applied_at FROM _schema_migrations ORDER BY name ASC");

  return {
    migrationsDir,
    discovered: fileNames,
    appliedNow,
    appliedTotal: result.rows.map((row) => ({
      name: String(row.name),
      appliedAt: new Date(row.applied_at).toISOString()
    }))
  };
}
