import { isRetryableApiError } from "./turn/recovery.js";
import { sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import type { RuntimeConfig, RuntimeRecoverTransition } from "../types.js";

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

export function pickRequestModel(
  _provider: string,
  configuredModel: string,
  _consecutiveFailures: number,
): string {
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
  transition: RuntimeRecoverTransition,
): string {
  const reason = transition.reason;
  if (reason.code === "recover.post_compaction_degradation") {
    return [
      `Detected repeated post-compaction empty responses (streak=${reason.noTextStreak}).`,
      `Recovery attempt ${reason.recoveryAttempt}/${reason.maxRecoveryAttempts} will keep the current objective frame active.`,
    ].join(" ");
  }

  const fragments = [
    `Model request failed (${truncateForStatus(reason.error, 160)}).`,
    `Auto-retrying in ${formatDelay(reason.delayMs)}.`,
    `streak=${reason.consecutiveFailures}`,
  ];

  if (reason.requestModel !== reason.configuredModel) {
    fragments.push(`modelFallback=${reason.requestModel}`);
  }

  if (reason.consecutiveFailures > 0) {
    fragments.push(
      `reducedContext=${reason.contextWindowMessages}/${reason.maxContextChars}/${reason.contextSummaryChars}`,
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
