const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableError(error) {
  const status = error?.status || error?.statusCode;
  if (status === 429 || (status >= 500 && status < 600)) return true;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket hang up")
  );
}

export async function withRetry(fn, { maxRetries = DEFAULT_MAX_RETRIES, baseDelayMs = BASE_DELAY_MS } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
