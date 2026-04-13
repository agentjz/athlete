import { isContinuationDirective, isInternalMessage } from "../session/taskState.js";
import type {
  ExternalizedToolResultReference,
  SessionRecord,
  SessionRuntimeStats,
  SessionRuntimeToolStats,
} from "../../types.js";

export interface ProviderUsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface ModelRequestMetric {
  durationMs: number;
  usage?: ProviderUsageSnapshot;
}

export interface ToolExecutionMetric {
  toolName: string;
  durationMs: number;
  ok: boolean;
  externalizedToolResult?: ExternalizedToolResultReference;
}

export function createEmptyRuntimeStats(timestamp = new Date().toISOString()): SessionRuntimeStats {
  return {
    version: 1,
    model: {
      requestCount: 0,
      waitDurationMsTotal: 0,
      usage: {
        requestsWithUsage: 0,
        requestsWithoutUsage: 0,
        inputTokensTotal: 0,
        outputTokensTotal: 0,
        totalTokensTotal: 0,
        reasoningTokensTotal: 0,
      },
    },
    tools: {
      callCount: 0,
      durationMsTotal: 0,
      byName: {},
    },
    events: {
      continuationCount: 0,
      yieldCount: 0,
      recoveryCount: 0,
      compressionCount: 0,
    },
    externalizedToolResults: {
      count: 0,
      byteLengthTotal: 0,
    },
    updatedAt: timestamp,
  };
}

export function normalizeRuntimeStats(
  runtimeStats: SessionRuntimeStats | undefined,
  timestamp = new Date().toISOString(),
): SessionRuntimeStats {
  const base = createEmptyRuntimeStats(timestamp);
  const usage = runtimeStats?.model?.usage;

  return {
    version: 1,
    model: {
      requestCount: normalizeNumber(runtimeStats?.model?.requestCount),
      waitDurationMsTotal: normalizeNumber(runtimeStats?.model?.waitDurationMsTotal),
      usage: {
        requestsWithUsage: normalizeNumber(usage?.requestsWithUsage),
        requestsWithoutUsage: normalizeNumber(usage?.requestsWithoutUsage),
        inputTokensTotal: normalizeNumber(usage?.inputTokensTotal),
        outputTokensTotal: normalizeNumber(usage?.outputTokensTotal),
        totalTokensTotal: normalizeNumber(usage?.totalTokensTotal),
        reasoningTokensTotal: normalizeNumber(usage?.reasoningTokensTotal),
      },
    },
    tools: {
      callCount: normalizeNumber(runtimeStats?.tools?.callCount),
      durationMsTotal: normalizeNumber(runtimeStats?.tools?.durationMsTotal),
      byName: normalizeToolMap(runtimeStats?.tools?.byName),
    },
    events: {
      continuationCount: normalizeNumber(runtimeStats?.events?.continuationCount),
      yieldCount: normalizeNumber(runtimeStats?.events?.yieldCount),
      recoveryCount: normalizeNumber(runtimeStats?.events?.recoveryCount),
      compressionCount: normalizeNumber(runtimeStats?.events?.compressionCount),
    },
    externalizedToolResults: {
      count: normalizeNumber(runtimeStats?.externalizedToolResults?.count),
      byteLengthTotal: normalizeNumber(runtimeStats?.externalizedToolResults?.byteLengthTotal),
    },
    updatedAt: normalizeTimestamp(runtimeStats?.updatedAt, base.updatedAt),
  };
}

export function normalizeSessionRuntimeStats(session: SessionRecord): SessionRecord {
  return { ...session, runtimeStats: normalizeRuntimeStats(session.runtimeStats) };
}

export function noteRuntimeTurnInput(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  if (!isInternalMessage(input) && !isContinuationDirective(input)) {
    return withRuntimeStats(session, normalizeRuntimeStats(session.runtimeStats, timestamp));
  }

  return bumpRuntimeEvent(session, "continuationCount", timestamp);
}

export function noteRuntimeYield(session: SessionRecord, timestamp = new Date().toISOString()): SessionRecord {
  return bumpRuntimeEvent(session, "yieldCount", timestamp);
}

export function noteRuntimeRecovery(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  return bumpRuntimeEvent(session, "recoveryCount", timestamp);
}

export function noteRuntimeCompression(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  return bumpRuntimeEvent(session, "compressionCount", timestamp);
}

export function noteRuntimeModelRequests(
  session: SessionRecord,
  metrics: ModelRequestMetric[],
  timestamp = new Date().toISOString(),
): SessionRecord {
  if (metrics.length === 0) {
    return withRuntimeStats(session, normalizeRuntimeStats(session.runtimeStats, timestamp));
  }

  const runtimeStats = normalizeRuntimeStats(session.runtimeStats, timestamp);
  for (const metric of metrics) {
    runtimeStats.model.requestCount += 1;
    runtimeStats.model.waitDurationMsTotal += normalizeNumber(metric.durationMs);

    if (hasUsage(metric.usage)) {
      runtimeStats.model.usage.requestsWithUsage += 1;
      runtimeStats.model.usage.inputTokensTotal += normalizeNumber(metric.usage?.inputTokens);
      runtimeStats.model.usage.outputTokensTotal += normalizeNumber(metric.usage?.outputTokens);
      runtimeStats.model.usage.totalTokensTotal += normalizeNumber(metric.usage?.totalTokens);
      runtimeStats.model.usage.reasoningTokensTotal += normalizeNumber(metric.usage?.reasoningTokens);
    } else {
      runtimeStats.model.usage.requestsWithoutUsage += 1;
    }
  }

  runtimeStats.updatedAt = timestamp;
  return withRuntimeStats(session, runtimeStats);
}

export function noteRuntimeToolExecution(
  session: SessionRecord,
  metric: ToolExecutionMetric,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const runtimeStats = normalizeRuntimeStats(session.runtimeStats, timestamp);
  const toolName = normalizeToolName(metric.toolName);
  const toolStats = runtimeStats.tools.byName[toolName] ?? createEmptyToolStats();

  runtimeStats.tools.callCount += 1;
  runtimeStats.tools.durationMsTotal += normalizeNumber(metric.durationMs);
  toolStats.callCount += 1;
  toolStats.durationMsTotal += normalizeNumber(metric.durationMs);
  if (metric.ok) {
    toolStats.okCount += 1;
  } else {
    toolStats.errorCount += 1;
  }
  runtimeStats.tools.byName[toolName] = toolStats;

  if (metric.externalizedToolResult) {
    runtimeStats.externalizedToolResults.count += 1;
    runtimeStats.externalizedToolResults.byteLengthTotal += normalizeNumber(metric.externalizedToolResult.byteLength);
  }

  runtimeStats.updatedAt = timestamp;
  return withRuntimeStats(session, runtimeStats);
}

function normalizeToolMap(
  value: Record<string, SessionRuntimeToolStats> | undefined,
): Record<string, SessionRuntimeToolStats> {
  const entries = Object.entries(value ?? {});
  return Object.fromEntries(entries.map(([key, stats]) => [normalizeToolName(key), normalizeToolStats(stats)]));
}

function normalizeToolStats(value: SessionRuntimeToolStats | undefined): SessionRuntimeToolStats {
  return {
    callCount: normalizeNumber(value?.callCount),
    durationMsTotal: normalizeNumber(value?.durationMsTotal),
    okCount: normalizeNumber(value?.okCount),
    errorCount: normalizeNumber(value?.errorCount),
  };
}

function bumpRuntimeEvent(
  session: SessionRecord,
  field: keyof SessionRuntimeStats["events"],
  timestamp: string,
): SessionRecord {
  const runtimeStats = normalizeRuntimeStats(session.runtimeStats, timestamp);
  runtimeStats.events[field] += 1;
  runtimeStats.updatedAt = timestamp;
  return withRuntimeStats(session, runtimeStats);
}

function withRuntimeStats(session: SessionRecord, runtimeStats: SessionRuntimeStats): SessionRecord {
  return {
    ...session,
    runtimeStats,
  };
}

function createEmptyToolStats(): SessionRuntimeToolStats {
  return {
    callCount: 0,
    durationMsTotal: 0,
    okCount: 0,
    errorCount: 0,
  };
}

function hasUsage(usage: ProviderUsageSnapshot | undefined): boolean {
  return [
    usage?.inputTokens,
    usage?.outputTokens,
    usage?.totalTokens,
    usage?.reasoningTokens,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeToolName(value: string): string {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "unknown_tool";
}
