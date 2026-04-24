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
    return "用户可修复错误：未找到 API key。请在当前项目的 `.deadmouse/.env` 里设置 `DEADMOUSE_API_KEY`。";
  }

  if (
    status === 401 ||
    lower.includes("authentication fails") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid api key") ||
    lower.includes("api key is invalid")
  ) {
    return "API 认证失败。请检查当前目录的 .env 里的 DEADMOUSE_API_KEY 是否正确。";
  }

  if (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET"].includes(code) ||
    /fetch failed|network|timeout|socket hang up|econnrefused|enotfound|etimedout/i.test(message)
  ) {
    return "环境错误：网络连接失败，当前 provider/base URL 不可达。请检查网络、代理设置，或确认 `DEADMOUSE_BASE_URL` 可访问。";
  }

  if (status === 404 || lower.includes("returned 404")) {
    return "用户可修复错误：provider 入口返回 404。请检查 `DEADMOUSE_BASE_URL` 是否是正确的 OpenAI-compatible API 根地址。";
  }

  if (typeof status === "number" && status >= 500) {
    return `Provider 错误：服务返回 ${status}。请稍后重试，或确认当前 provider 服务是否正常。`;
  }

  return message;
}
