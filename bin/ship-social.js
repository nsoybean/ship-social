#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const readline = require("node:readline/promises");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR_NAME = ".ship-social-runtime";

function pathContainsNodeModules(value) {
  return path.resolve(value).split(path.sep).includes("node_modules");
}

function ensureSymlink(target, linkPath) {
  const desiredTarget = path.resolve(target);
  let existingStats = null;

  try {
    existingStats = fs.lstatSync(linkPath);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }

  if (existingStats) {
    if (!existingStats.isSymbolicLink()) {
      return;
    }

    try {
      const currentTarget = fs.readlinkSync(linkPath);
      const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
      if (resolvedCurrentTarget === desiredTarget) {
        return;
      }
    } catch (_err) {
      // If readlink fails, replace with a fresh symlink.
    }

    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  const type = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(desiredTarget, linkPath, type);
}

function copyPackageRuntimeFiles(runtimeRoot) {
  const entries = [
    ".env.example",
    "app",
    "components",
    "migrations",
    "lib",
    "public",
    "scripts",
    "jsconfig.json",
    "next-env.d.ts",
    "package.json",
    "tsconfig.json"
  ];

  for (const entry of entries) {
    const source = path.join(PACKAGE_ROOT, entry);
    const destination = path.join(runtimeRoot, entry);
    if (!fs.existsSync(source)) {
      continue;
    }

    fs.cpSync(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  }
}

function resolveExecutionRoot() {
  if (!pathContainsNodeModules(PACKAGE_ROOT)) {
    return PACKAGE_ROOT;
  }

  const runtimeRoot = path.resolve(process.cwd(), RUNTIME_DIR_NAME);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  copyPackageRuntimeFiles(runtimeRoot);
  ensureSymlink(path.join(PACKAGE_ROOT, "node_modules"), path.join(runtimeRoot, "node_modules"));
  console.log(`[ship-social] setup: using runtime workspace ${runtimeRoot}`);
  return runtimeRoot;
}

const ROOT_DIR = resolveExecutionRoot();
const ENV_PATH = path.join(ROOT_DIR, ".env");
const EMBEDDED_DB_DIR = path.join(ROOT_DIR, "data", "embedded-postgres");

const EMBEDDED_USER = "ship_social";
const EMBEDDED_PASSWORD = "ship_social";
const EMBEDDED_DB_NAME = "ship_social";
const DEFAULT_APP_URL = "http://localhost:3000";
const EMBEDDED_MARKER_KEY = "SHIP_SOCIAL_EMBEDDED_POSTGRES";

function printHelp() {
  console.log("ship-social CLI");
  console.log("");
  console.log("Usage:");
  console.log("  ship-social quickstart");
}

function log(step, message) {
  console.log(`[quickstart] ${step}: ${message}`);
}

function error(message) {
  console.error(`[ship-social] error: ${message}`);
}

function normalizeBool(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

function parsePort(raw, fallback) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseEnvValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    const unquoted = value.slice(1, -1);
    if (quote === '"') {
      return unquoted
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return unquoted;
  }

  return value;
}

function serializeEnvValue(value) {
  const stringValue = String(value ?? "");
  if (/^[A-Za-z0-9_./:@+-]*$/.test(stringValue)) {
    return stringValue;
  }

  return JSON.stringify(stringValue);
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { values: {}, order: [] };
  }

  const values = {};
  const order = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2];
    values[key] = parseEnvValue(rawValue);
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  return { values, order };
}

async function confirm(rl, prompt, defaultValue = false) {
  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();

  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}

async function promptRequired(rl, label, existingValue) {
  const hasExisting = Boolean(String(existingValue || "").trim());

  for (;;) {
    const suffix = hasExisting ? " (press enter to keep existing)" : "";
    const answer = (await rl.question(`${label}${suffix}: `)).trim();

    if (answer) {
      return answer;
    }
    if (hasExisting) {
      return String(existingValue);
    }

    console.log("Value is required.");
  }
}

async function promptAiKeyChoice(rl, existingEnv) {
  const hasGateway = Boolean(String(existingEnv.AI_GATEWAY_API_KEY || "").trim());
  const hasOpenAi = Boolean(String(existingEnv.OPENAI_API_KEY || "").trim());

  if (hasGateway && !hasOpenAi) {
    return "AI_GATEWAY_API_KEY";
  }

  if (!hasGateway && hasOpenAi) {
    return "OPENAI_API_KEY";
  }

  for (;;) {
    const answer = (await rl
      .question("Use which AI key? [1] AI_GATEWAY_API_KEY (recommended), [2] OPENAI_API_KEY: "))
      .trim();

    if (answer === "1" || /^ai_gateway_api_key$/i.test(answer)) {
      return "AI_GATEWAY_API_KEY";
    }

    if (answer === "2" || /^openai_api_key$/i.test(answer)) {
      return "OPENAI_API_KEY";
    }

    console.log("Choose 1 or 2.");
  }
}

async function writeEnvWithConfirmation({ rl, filePath, envDoc, updates }) {
  const nextValues = { ...envDoc.values };

  for (const [key, rawValue] of Object.entries(updates)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const nextValue = String(rawValue);
    const existing = nextValues[key];

    if (typeof existing === "undefined") {
      nextValues[key] = nextValue;
      continue;
    }

    if (existing === nextValue) {
      continue;
    }

    const shouldOverwrite = await confirm(rl, `${key} is already set in .env. Overwrite it?`, false);
    if (shouldOverwrite) {
      nextValues[key] = nextValue;
    }
  }

  const newKeys = Object.keys(nextValues)
    .filter((key) => !envDoc.order.includes(key))
    .sort((a, b) => a.localeCompare(b));

  const orderedKeys = [...envDoc.order, ...newKeys];
  const output = orderedKeys.map((key) => `${key}=${serializeEnvValue(nextValues[key])}`).join("\n");

  fs.writeFileSync(filePath, `${output}\n`, "utf8");
  return nextValues;
}

function resolveDatabaseMode(fileEnv) {
  const processDb = String(process.env.DATABASE_URL || "").trim();
  const fileDb = String(fileEnv.DATABASE_URL || "").trim();
  const markerInFile = normalizeBool(fileEnv[EMBEDDED_MARKER_KEY]);
  const markerInProcess = normalizeBool(process.env[EMBEDDED_MARKER_KEY]);

  if (processDb && !markerInProcess) {
    return { mode: "external", databaseUrl: processDb };
  }

  if (fileDb && !markerInFile) {
    return { mode: "external", databaseUrl: fileDb };
  }

  if (processDb) {
    return { mode: "embedded", databaseUrl: processDb };
  }

  if (fileDb) {
    return { mode: "embedded", databaseUrl: fileDb };
  }

  return { mode: "embedded", databaseUrl: "" };
}

function embeddedDatabaseUrl(port) {
  return `postgresql://${encodeURIComponent(EMBEDDED_USER)}:${encodeURIComponent(
    EMBEDDED_PASSWORD
  )}@127.0.0.1:${port}/${EMBEDDED_DB_NAME}`;
}

async function startEmbeddedPostgres(port) {
  const EmbeddedPostgresModule = await import("embedded-postgres");
  const EmbeddedPostgres = EmbeddedPostgresModule.default;

  fs.mkdirSync(EMBEDDED_DB_DIR, { recursive: true });
  const hasExistingCluster = fs.existsSync(path.join(EMBEDDED_DB_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: EMBEDDED_DB_DIR,
    user: EMBEDDED_USER,
    password: EMBEDDED_PASSWORD,
    port,
    persistent: true,
    onLog: (line) => {
      const trimmed = String(line || "").trim();
      if (trimmed) log("postgres", trimmed);
    },
    onError: (line) => {
      const trimmed = String(line || "").trim();
      if (trimmed) console.error(`[quickstart][postgres] ${trimmed}`);
    }
  });

  if (!hasExistingCluster) {
    await pg.initialise();
  } else {
    log("database", "detected existing embedded Postgres cluster; skipping init");
  }
  await pg.start();

  try {
    await pg.createDatabase(EMBEDDED_DB_NAME);
  } catch (err) {
    const message = String(err?.message || "");
    if (!/already exists/i.test(message)) {
      throw err;
    }
  }

  return {
    instance: pg,
    databaseUrl: embeddedDatabaseUrl(port)
  };
}

async function runMigrations(databaseUrl) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;

  try {
    const migrationsModulePath = path.join(ROOT_DIR, "lib", "db", "migrations.js");
    const migrationsModule = await import(pathToFileURL(migrationsModulePath).href);

    if (typeof migrationsModule.runMigrations !== "function") {
      throw new Error("runMigrations() was not found in lib/db/migrations.js");
    }

    const result = await migrationsModule.runMigrations();
    const appliedNow = Array.isArray(result?.appliedNow) ? result.appliedNow : [];

    if (appliedNow.length === 0) {
      log("migration", "no pending migrations");
      return;
    }

    for (const entry of appliedNow) {
      const name = typeof entry === "string" ? entry : entry?.name;
      if (name) {
        log("migration", `apply ${name}`);
      }
    }
  } finally {
    if (typeof previousDatabaseUrl === "undefined") {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

function spawnDevServer(env) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(npmCommand, ["run", "dev"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env
  });
}

async function waitForProcessExit(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (typeof code === "number") {
        resolve(code);
        return;
      }

      if (signal) {
        resolve(1);
        return;
      }

      resolve(0);
    });
  });
}

async function runQuickstart() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let embedded = null;

  try {
    log("setup", "starting ship-social quickstart");
    const envDoc = readEnvFile(ENV_PATH);
    const existingEnv = envDoc.values;

    const updates = {
      APP_URL: String(existingEnv.APP_URL || process.env.APP_URL || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL,
      GITHUB_ACCESS_TOKEN: await promptRequired(
        rl,
        "GITHUB_ACCESS_TOKEN",
        existingEnv.GITHUB_ACCESS_TOKEN
      )
    };

    const selectedAiKey = await promptAiKeyChoice(rl, existingEnv);
    updates[selectedAiKey] = await promptRequired(rl, selectedAiKey, existingEnv[selectedAiKey]);

    const databaseMode = resolveDatabaseMode(existingEnv);
    const embeddedPort = parsePort(
      existingEnv.SHIP_SOCIAL_EMBEDDED_PORT || process.env.SHIP_SOCIAL_EMBEDDED_PORT,
      55432
    );

    let databaseUrl = databaseMode.databaseUrl;
    if (databaseMode.mode === "external") {
      log("database", "detected external DATABASE_URL; skipping embedded postgres startup");
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required when external mode is selected.");
      }
    } else {
      log("database", `starting embedded Postgres on 127.0.0.1:${embeddedPort}`);
      const started = await startEmbeddedPostgres(embeddedPort);
      embedded = started.instance;
      databaseUrl = started.databaseUrl;
      updates.DATABASE_URL = databaseUrl;
      updates[EMBEDDED_MARKER_KEY] = "true";
      updates.SHIP_SOCIAL_EMBEDDED_PORT = String(embeddedPort);
    }

    log("database", "running migrations");
    await runMigrations(databaseUrl);

    await writeEnvWithConfirmation({
      rl,
      filePath: ENV_PATH,
      envDoc,
      updates
    });
    log("env", `wrote ${path.relative(ROOT_DIR, ENV_PATH)}`);

    log("app", "launching Next.js dev server");
    log("app", `open ${updates.APP_URL}`);

    const devServer = spawnDevServer({
      ...process.env,
      DATABASE_URL: databaseUrl
    });

    const onSignal = (signal) => {
      if (!devServer.killed) {
        devServer.kill(signal);
      }
    };

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    const exitCode = await waitForProcessExit(devServer);

    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);

    if (embedded) {
      log("database", "stopping embedded Postgres");
      await embedded.stop();
      embedded = null;
    }

    process.exit(exitCode);
  } catch (err) {
    error(String(err?.message || err));
    process.exitCode = 1;

    if (embedded) {
      try {
        log("database", "stopping embedded Postgres after failure");
        await embedded.stop();
      } catch (stopErr) {
        error(`failed to stop embedded Postgres cleanly: ${String(stopErr?.message || stopErr)}`);
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const [, , command] = process.argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "quickstart") {
    await runQuickstart();
    return;
  }

  error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  error(String(err?.message || err));
  process.exit(1);
});
