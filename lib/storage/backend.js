import { assertStateBackend } from "./adapter-interface";
import * as jsonBackend from "./json-state-backend";
import * as postgresBackend from "./postgres-state-backend";
import { hasDatabaseUrl } from "../db/postgres-client";

let cachedBackend = null;
let cachedBackendName = "";

function resolveBackendName() {
  const configured = String(process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (configured) {
    if (configured !== "json" && configured !== "postgres") {
      throw new Error(`Unsupported STORAGE_BACKEND value: ${configured}`);
    }

    return configured;
  }

  return hasDatabaseUrl() ? "postgres" : "json";
}

function createBackend(name) {
  if (name === "postgres") {
    return assertStateBackend(postgresBackend, name);
  }

  return assertStateBackend(jsonBackend, "json");
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
