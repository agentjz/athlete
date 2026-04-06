import type { SessionRecord } from "../types.js";

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
  const status = (error as { status?: unknown }).status;
  const lower = message.toLowerCase();

  if (
    status === 401 ||
    lower.includes("authentication fails") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid api key") ||
    lower.includes("api key is invalid")
  ) {
    return "API 认证失败。请检查当前目录的 .env 里的 ATHLETE_API_KEY 是否正确。";
  }

  return message;
}
