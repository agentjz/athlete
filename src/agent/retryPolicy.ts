import { getErrorMessage } from "./errors.js";
import { isRetryableApiError } from "./recovery.js";
import { sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import type { RuntimeConfig } from "../types.js";

export type RecoveryRequestConfig = Pick<
  RuntimeConfig,
  "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars"
>;

export function isRecoverableTurnError(error: unknown): boolean {
  if (isRetryableApiError(error)) {
    return true;
  }

  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    message.includes("connection error") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("connection refused") ||
    message.includes("connect timeout") ||
    message.includes("headers timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("stream ended unexpectedly")
  );
}

export function pickRequestModel(configuredModel: string, consecutiveFailures: number): string {
  if (configuredModel === "deepseek-reasoner" && consecutiveFailures >= 6) {
    return "deepseek-chat";
  }

  return configuredModel;
}

export function buildRecoveryRequestConfig(
  config: RuntimeConfig,
  model: string,
  consecutiveFailures: number,
): RecoveryRequestConfig {
  const shrinkStep = Math.min(4, Math.floor(consecutiveFailures / 2));
  const factors = [1, 0.85, 0.7, 0.55, 0.4];
  const factor = factors[shrinkStep] ?? 0.4;

  return {
    model,
    contextWindowMessages: Math.max(6, Math.floor(config.contextWindowMessages * factor)),
    maxContextChars: Math.max(8_000, Math.floor(config.maxContextChars * factor)),
    contextSummaryChars: Math.max(1_000, Math.floor(config.contextSummaryChars * Math.max(0.5, factor))),
  };
}

export function buildRecoveryStatus(
  error: unknown,
  consecutiveFailures: number,
  delayMs: number,
  configuredModel: string,
  requestModel: string,
  requestConfig: RecoveryRequestConfig,
): string {
  const fragments = [
    `Model request failed (${truncateForStatus(getErrorMessage(error), 160)}).`,
    `Auto-retrying in ${formatDelay(delayMs)}.`,
    `streak=${consecutiveFailures}`,
  ];

  if (requestModel !== configuredModel) {
    fragments.push(`modelFallback=${requestModel}`);
  }

  if (consecutiveFailures > 0) {
    fragments.push(
      `reducedContext=${requestConfig.contextWindowMessages}/${requestConfig.maxContextChars}/${requestConfig.contextSummaryChars}`,
    );
  }

  return fragments.join(" ");
}

export function computeRecoveryDelayMs(consecutiveFailures: number): number {
  const exponent = Math.min(6, Math.max(0, consecutiveFailures - 1));
  return Math.min(30_000, 1_000 * (2 ** exponent));
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal, "Retry delay aborted");
  await sleepWithSignal(ms, signal);
}

function formatDelay(ms: number): string {
  if (ms % 1_000 === 0) {
    return `${ms / 1_000}s`;
  }

  return `${ms}ms`;
}

function truncateForStatus(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}
