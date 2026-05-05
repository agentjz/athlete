import { isAbortError, sleepWithSignal } from "../../utils/abort.js";

const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 1200;

export async function withApiRetries<T>(operation: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error;
      if (!isRetryableApiError(error) || attempt === API_MAX_RETRIES) {
        break;
      }

      await sleepWithSignal(API_RETRY_BASE_DELAY_MS * attempt, abortSignal);
    }
  }

  throw lastError;
}

export function isRetryableApiError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection error") ||
    message.includes("connection reset") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("connect timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}
