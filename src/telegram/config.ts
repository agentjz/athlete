import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";

export interface TelegramConfig {
  token: string;
  apiBaseUrl: string;
  proxyUrl: string;
  allowedUserIds: number[];
  polling: {
    timeoutSeconds: number;
    limit: number;
    retryBackoffMs: number;
  };
  delivery: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  messageChunkChars: number;
  typingIntervalMs: number;
}

export interface TelegramRuntimeConfig extends TelegramConfig {
  stateDir: string;
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  token: "",
  apiBaseUrl: "https://api.telegram.org",
  proxyUrl: "",
  allowedUserIds: [],
  polling: {
    timeoutSeconds: 50,
    limit: 100,
    retryBackoffMs: 1_000,
  },
  delivery: {
    maxRetries: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
  },
  messageChunkChars: 3_500,
  typingIntervalMs: 4_000,
};

export function normalizeTelegramConfig(config: Partial<TelegramConfig> = {}): TelegramConfig {
  return {
    token: String(config.token ?? DEFAULT_TELEGRAM_CONFIG.token).trim(),
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl),
    proxyUrl: normalizeProxyUrl(config.proxyUrl),
    allowedUserIds: normalizeAllowedUserIds(config.allowedUserIds),
    polling: {
      timeoutSeconds: clampNumber(
        config.polling?.timeoutSeconds,
        1,
        50,
        DEFAULT_TELEGRAM_CONFIG.polling.timeoutSeconds,
      ),
      limit: clampNumber(config.polling?.limit, 1, 100, DEFAULT_TELEGRAM_CONFIG.polling.limit),
      retryBackoffMs: clampNumber(
        config.polling?.retryBackoffMs,
        250,
        60_000,
        DEFAULT_TELEGRAM_CONFIG.polling.retryBackoffMs,
      ),
    },
    delivery: {
      maxRetries: clampNumber(config.delivery?.maxRetries, 1, 32, DEFAULT_TELEGRAM_CONFIG.delivery.maxRetries),
      baseDelayMs: clampNumber(
        config.delivery?.baseDelayMs,
        250,
        120_000,
        DEFAULT_TELEGRAM_CONFIG.delivery.baseDelayMs,
      ),
      maxDelayMs: clampNumber(
        config.delivery?.maxDelayMs,
        1_000,
        120_000,
        DEFAULT_TELEGRAM_CONFIG.delivery.maxDelayMs,
      ),
    },
    messageChunkChars: clampNumber(
      config.messageChunkChars,
      128,
      4_096,
      DEFAULT_TELEGRAM_CONFIG.messageChunkChars,
    ),
    typingIntervalMs: clampNumber(
      config.typingIntervalMs,
      500,
      60_000,
      DEFAULT_TELEGRAM_CONFIG.typingIntervalMs,
    ),
  };
}

export function resolveTelegramRuntimeConfig(
  config: Partial<TelegramConfig> | undefined,
  stateRootDir: string,
): TelegramRuntimeConfig {
  const normalized = normalizeTelegramConfig(config);
  return {
    ...normalized,
    stateDir: path.join(getProjectStatePaths(stateRootDir).athleteDir, "telegram"),
  };
}

export function parseTelegramAllowedUserIds(raw: string | undefined): number[] {
  if (!raw) {
    return [];
  }

  return normalizeAllowedUserIds(
    raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value)),
  );
}

function normalizeApiBaseUrl(raw: string | undefined): string {
  const value = String(raw ?? DEFAULT_TELEGRAM_CONFIG.apiBaseUrl).trim();
  return value.replace(/\/+$/u, "") || DEFAULT_TELEGRAM_CONFIG.apiBaseUrl;
}

function normalizeProxyUrl(raw: string | undefined): string {
  const value = String(raw ?? DEFAULT_TELEGRAM_CONFIG.proxyUrl).trim();
  return value.replace(/\/+$/u, "");
}

function normalizeAllowedUserIds(values: readonly number[] | undefined): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<number>();
  for (const value of values) {
    const normalized = Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
    if (Number.isFinite(normalized) && normalized > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}
