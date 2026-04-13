import type { MineruRuntimeConfig, RuntimeConfig } from "../types.js";

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parsePlaywrightBrowserEnv(value: string | undefined): RuntimeConfig["mcp"]["playwright"]["browser"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "chromium":
      return "chromium";
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    case "webkit":
      return "webkit";
    case "msedge":
      return "msedge";
    default:
      return undefined;
  }
}

export function parsePlaywrightOutputModeEnv(value: string | undefined): RuntimeConfig["mcp"]["playwright"]["outputMode"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "file":
      return "file";
    case "stdout":
      return "stdout";
    default:
      return undefined;
  }
}

export function readMineruRuntimeConfig(): MineruRuntimeConfig {
  return {
    token: (process.env.MINERU_API_TOKEN ?? "").trim(),
    baseUrl: (process.env.MINERU_BASE_URL ?? "https://mineru.net/api/v4").trim(),
    modelVersion: (process.env.MINERU_MODEL_VERSION ?? "vlm").trim(),
    language: (process.env.MINERU_LANGUAGE ?? "ch").trim(),
    enableTable: parseBooleanEnv(process.env.MINERU_ENABLE_TABLE) ?? true,
    enableFormula: parseBooleanEnv(process.env.MINERU_ENABLE_FORMULA) ?? true,
    pollIntervalMs: clampNumber(
      Number.parseInt(process.env.MINERU_POLL_INTERVAL_MS ?? "", 10),
      200,
      60_000,
      2_000,
    ),
    timeoutMs: clampNumber(
      Number.parseInt(process.env.MINERU_TIMEOUT_MS ?? "", 10),
      5_000,
      60 * 60 * 1000,
      300_000,
    ),
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
