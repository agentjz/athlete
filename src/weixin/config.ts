import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import type { WeixinLoginState } from "./credentialsStore.js";

const DEFAULT_OPENILINK_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_OPENILINK_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export interface WeixinConfig {
  baseUrl: string;
  cdnBaseUrl: string;
  allowedUserIds: string[];
  polling: {
    timeoutMs: number;
    retryBackoffMs: number;
  };
  delivery: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    receiptTimeoutMs: number;
  };
  messageChunkChars: number;
  typingIntervalMs: number;
  qrTimeoutMs: number;
  routeTag: string;
}

export interface WeixinRuntimeConfig extends WeixinConfig {
  stateDir: string;
  credentialsFile: string;
  syncBufFile: string;
  sessionMapFile: string;
  attachmentStoreFile: string;
  contextTokenFile: string;
  deliveryQueueFile: string;
  processLockFile: string;
  credentials: WeixinLoginState | null;
}

export const DEFAULT_WEIXIN_CONFIG: WeixinConfig = {
  baseUrl: DEFAULT_OPENILINK_BASE_URL,
  cdnBaseUrl: DEFAULT_OPENILINK_CDN_BASE_URL,
  allowedUserIds: [],
  polling: {
    timeoutMs: 30_000,
    retryBackoffMs: 1_000,
  },
  delivery: {
    maxRetries: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
    receiptTimeoutMs: 5_000,
  },
  messageChunkChars: 3_500,
  typingIntervalMs: 4_000,
  qrTimeoutMs: 480_000,
  routeTag: "",
};

export function normalizeWeixinConfig(config: Partial<WeixinConfig> = {}): WeixinConfig {
  return {
    baseUrl: normalizeUrl(config.baseUrl, DEFAULT_WEIXIN_CONFIG.baseUrl),
    cdnBaseUrl: normalizeUrl(config.cdnBaseUrl, DEFAULT_WEIXIN_CONFIG.cdnBaseUrl),
    allowedUserIds: normalizeAllowedUserIds(config.allowedUserIds),
    polling: {
      timeoutMs: clampNumber(config.polling?.timeoutMs, 1_000, 120_000, DEFAULT_WEIXIN_CONFIG.polling.timeoutMs),
      retryBackoffMs: clampNumber(
        config.polling?.retryBackoffMs,
        250,
        60_000,
        DEFAULT_WEIXIN_CONFIG.polling.retryBackoffMs,
      ),
    },
    delivery: {
      maxRetries: clampNumber(config.delivery?.maxRetries, 1, 32, DEFAULT_WEIXIN_CONFIG.delivery.maxRetries),
      baseDelayMs: clampNumber(
        config.delivery?.baseDelayMs,
        250,
        120_000,
        DEFAULT_WEIXIN_CONFIG.delivery.baseDelayMs,
      ),
      maxDelayMs: clampNumber(
        config.delivery?.maxDelayMs,
        1_000,
        120_000,
        DEFAULT_WEIXIN_CONFIG.delivery.maxDelayMs,
      ),
      receiptTimeoutMs: clampNumber(
        config.delivery?.receiptTimeoutMs,
        1_000,
        300_000,
        DEFAULT_WEIXIN_CONFIG.delivery.receiptTimeoutMs,
      ),
    },
    messageChunkChars: clampNumber(
      config.messageChunkChars,
      128,
      12_000,
      DEFAULT_WEIXIN_CONFIG.messageChunkChars,
    ),
    typingIntervalMs: clampNumber(
      config.typingIntervalMs,
      500,
      60_000,
      DEFAULT_WEIXIN_CONFIG.typingIntervalMs,
    ),
    qrTimeoutMs: clampNumber(config.qrTimeoutMs, 30_000, 900_000, DEFAULT_WEIXIN_CONFIG.qrTimeoutMs),
    routeTag: String(config.routeTag ?? DEFAULT_WEIXIN_CONFIG.routeTag).trim(),
  };
}

export function resolveWeixinRuntimeConfig(
  config: Partial<WeixinConfig> | undefined,
  stateRootDir: string,
  credentials: WeixinLoginState | null = null,
): WeixinRuntimeConfig {
  const normalized = normalizeWeixinConfig(config);
  const stateDir = path.join(getProjectStatePaths(stateRootDir).athleteDir, "weixin");
  return {
    ...normalized,
    stateDir,
    credentialsFile: path.join(stateDir, "credentials.json"),
    syncBufFile: path.join(stateDir, "sync-buf.json"),
    sessionMapFile: path.join(stateDir, "session-map.json"),
    attachmentStoreFile: path.join(stateDir, "attachments.json"),
    contextTokenFile: path.join(stateDir, "context-token.json"),
    deliveryQueueFile: path.join(stateDir, "delivery.json"),
    processLockFile: path.join(stateDir, "service.pid"),
    credentials,
  };
}

export function parseWeixinAllowedUserIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return normalizeAllowedUserIds(raw.split(/[,\r\n]+/u));
}

function normalizeUrl(raw: string | undefined, fallback: string): string {
  const value = String(raw ?? fallback).trim().replace(/\/+$/u, "");
  return value || fallback;
}

function normalizeAllowedUserIds(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
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
