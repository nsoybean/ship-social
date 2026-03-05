import fs from "node:fs/promises";
import path from "node:path";
import { defaultState, sanitizeState } from "./state-shape";

function resolveStateFilePath() {
  const configured = String(process.env.STATE_FILE_PATH || "").trim();
  if (!configured) {
    return path.join(process.cwd(), "data", "state.json");
  }

  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readState() {
  const statePath = resolveStateFilePath();
  await ensureDir(statePath);

  try {
    const raw = await fs.readFile(statePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : "";

    if (code === "ENOENT") {
      const initial = defaultState();
      await fs.writeFile(statePath, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }

    return defaultState();
  }
}

export async function writeState(next) {
  const statePath = resolveStateFilePath();
  await ensureDir(statePath);
  const sanitized = sanitizeState(next);
  await fs.writeFile(statePath, JSON.stringify(sanitized, null, 2), "utf8");
}
