const REQUIRED_METHODS = ["readState", "writeState"];

export function assertStateBackend(backend, name) {
  for (const method of REQUIRED_METHODS) {
    if (typeof backend?.[method] !== "function") {
      throw new Error(`Invalid state backend '${name}': missing ${method}()`);
    }
  }

  return backend;
}
