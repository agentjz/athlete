import type { SessionRecord } from "../types.js";
import { ConfigFileError } from "../config/errors.js";

export class AgentTurnError extends Error {
  readonly session: SessionRecord;

  constructor(message: string, session: SessionRecord, options?: { cause?: unknown }) {
    super(message);
    this.name = "AgentTurnError";
    this.session = session;

    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = String((error as { code?: unknown }).code ?? "");
  const status = (error as { status?: unknown }).status;
  const lower = message.toLowerCase();

  if (error instanceof ConfigFileError) {
    return error.message;
  }

  if (
    lower.includes("api key missing") ||
    lower.includes("no api key found") ||
    lower.includes("set deadmouse_api_key")
  ) {
    return "User-fixable error: API key not found. Set `DEADMOUSE_API_KEY` in the current project `.deadmouse/.env`.";
  }

  if (
    status === 401 ||
    lower.includes("authentication fails") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid api key") ||
    lower.includes("api key is invalid")
  ) {
    return "API authentication failed. Check whether `DEADMOUSE_API_KEY` in the current project `.env` is correct.";
  }

  if (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET"].includes(code) ||
    /fetch failed|network|timeout|socket hang up|econnrefused|enotfound|etimedout/i.test(message)
  ) {
    return "Environment error: network connection failed; the current provider/base URL is unreachable. Check network, proxy settings, or `DEADMOUSE_BASE_URL`.";
  }

  if (status === 404 || lower.includes("returned 404")) {
    return "User-fixable error: provider returned 404. Check whether `DEADMOUSE_BASE_URL` is the correct OpenAI-compatible API base URL.";
  }

  if (typeof status === "number" && status >= 500) {
    return `Provider error: service returned ${status}. Retry later or confirm the provider service is healthy.`;
  }

  return message;
}
