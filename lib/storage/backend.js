import { assertStateBackend } from "./adapter-interface";
import * as postgresBackend from "./postgres-state-backend";

let cachedBackend = null;
let cachedBackendName = "";

function resolveBackendName() {
  const configured = String(process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (configured) {
    if (configured !== "postgres") {
      if (configured === "json") {
        throw new Error("JSON storage backend is no longer supported. Use Postgres (DATABASE_URL) only.");
      }
      throw new Error(`Unsupported STORAGE_BACKEND value: ${configured}`);
    }

    return configured;
  }

  return "postgres";
}

function createBackend(name) {
  return assertStateBackend(postgresBackend, name);
}

export function getStorageBackendName() {
  if (!cachedBackend) {
    cachedBackendName = resolveBackendName();
    cachedBackend = createBackend(cachedBackendName);
  }

  return cachedBackendName;
}

function getStateBackend() {
  if (!cachedBackend) {
    const name = resolveBackendName();
    cachedBackend = createBackend(name);
    cachedBackendName = name;
  }

  return cachedBackend;
}

export async function readStateFromBackend() {
  return getStateBackend().readState();
}

export async function writeStateToBackend(next) {
  await getStateBackend().writeState(next);
}

export function resetStorageBackendForTests() {
  cachedBackend = null;
  cachedBackendName = "";
}
