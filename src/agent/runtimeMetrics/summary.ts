import type { SessionRecord, SessionRuntimeToolStats } from "../../types.js";
import {
  buildDerivedDiagnostics,
  buildDurableTruth,
  type RuntimePromptDiagnostics,
  type RuntimeSummaryDerivedDiagnostics,
  type RuntimeSummaryDurableTruth,
} from "./diagnostics.js";
import { normalizeRuntimeStats } from "./state.js";

export type {
  RuntimePromptDiagnostics,
  RuntimeSummaryDerivedDiagnostics,
  RuntimeSummaryDurableTruth,
} from "./diagnostics.js";

export type RuntimeUsageAvailability = "available" | "partial" | "unavailable";
export type RuntimeHealthStatus = "healthy" | "warning" | "recovering";

export interface SessionRuntimeSummary {
  health: {
    status: RuntimeHealthStatus;
    reasons: string[];
  };
  usage: {
    availability: RuntimeUsageAvailability;
    requestsWithUsage: number;
    requestsWithoutUsage: number;
    inputTokensTotal: number;
    outputTokensTotal: number;
    totalTokensTotal: number;
    reasoningTokensTotal: number;
  };
  modelRequests: number;
  modelWaitDurationMsTotal: number;
  toolCalls: number;
  toolDurationMsTotal: number;
  yields: number;
  continuations: number;
  recoveries: number;
  compressions: number;
  externalizedResults: {
    count: number;
    byteLengthTotal: number;
  };
  topTools: Array<{
    name: string;
    callCount: number;
    durationMsTotal: number;
    okCount: number;
    errorCount: number;
  }>;
  slowestStep: {
    key: string;
    label: string;
    durationMsTotal: number;
  };
  durableTruth: RuntimeSummaryDurableTruth;
  derivedDiagnostics: RuntimeSummaryDerivedDiagnostics;
}

export function buildSessionRuntimeSummary(
  session: Pick<SessionRecord, "runtimeStats" | "checkpoint" | "verificationState">,
  options: {
    promptDiagnostics?: RuntimePromptDiagnostics;
  } = {},
): SessionRuntimeSummary {
  const stats = normalizeRuntimeStats(session.runtimeStats);
  const topTools = Object.entries(stats.tools.byName)
    .map(([name, toolStats]) => ({
      name,
      ...normalizeToolStats(toolStats),
    }))
    .sort((left, right) =>
      right.durationMsTotal - left.durationMsTotal ||
      right.callCount - left.callCount ||
      left.name.localeCompare(right.name),
    );

  const usageAvailability = getUsageAvailability(
    stats.model.usage.requestsWithUsage,
    stats.model.usage.requestsWithoutUsage,
  );

  return {
    health: buildHealth(session, stats.events.recoveryCount),
    usage: {
      availability: usageAvailability,
      requestsWithUsage: stats.model.usage.requestsWithUsage,
      requestsWithoutUsage: stats.model.usage.requestsWithoutUsage,
      inputTokensTotal: stats.model.usage.inputTokensTotal,
      outputTokensTotal: stats.model.usage.outputTokensTotal,
      totalTokensTotal: stats.model.usage.totalTokensTotal,
      reasoningTokensTotal: stats.model.usage.reasoningTokensTotal,
    },
    modelRequests: stats.model.requestCount,
    modelWaitDurationMsTotal: stats.model.waitDurationMsTotal,
    toolCalls: stats.tools.callCount,
    toolDurationMsTotal: stats.tools.durationMsTotal,
    yields: stats.events.yieldCount,
    continuations: stats.events.continuationCount,
    recoveries: stats.events.recoveryCount,
    compressions: stats.events.compressionCount,
    externalizedResults: {
      count: stats.externalizedToolResults.count,
      byteLengthTotal: stats.externalizedToolResults.byteLengthTotal,
    },
    topTools,
    slowestStep: pickSlowestStep(stats.model.waitDurationMsTotal, topTools),
    durableTruth: buildDurableTruth(session, stats),
    derivedDiagnostics: buildDerivedDiagnostics({
      session,
      stats,
      topTools,
      promptDiagnostics: options.promptDiagnostics,
    }),
  };
}

function buildHealth(
  session: Pick<SessionRecord, "checkpoint" | "verificationState">,
  recoveryCount: number,
): SessionRuntimeSummary["health"] {
  const reasons: string[] = [];
  const recovering = session.checkpoint?.flow?.phase === "recovery";

  if (recovering) {
    reasons.push("checkpoint is currently in recovery");
  }
  if (session.verificationState?.status === "failed") {
    reasons.push("last verification attempt failed");
  }
  if (recoveryCount > 0) {
    reasons.push(`provider recovery triggered ${recoveryCount} time(s)`);
  }

  if (recovering) {
    return { status: "recovering", reasons };
  }
  if (reasons.length > 0) {
    return { status: "warning", reasons };
  }

  return { status: "healthy", reasons: [] };
}

function getUsageAvailability(
  requestsWithUsage: number,
  requestsWithoutUsage: number,
): RuntimeUsageAvailability {
  if (requestsWithUsage === 0) {
    return "unavailable";
  }
  if (requestsWithoutUsage === 0) {
    return "available";
  }
  return "partial";
}

function normalizeToolStats(toolStats: SessionRuntimeToolStats): SessionRuntimeToolStats {
  return {
    callCount: toolStats.callCount,
    durationMsTotal: toolStats.durationMsTotal,
    okCount: toolStats.okCount,
    errorCount: toolStats.errorCount,
  };
}

function pickSlowestStep(
  modelWaitDurationMsTotal: number,
  topTools: SessionRuntimeSummary["topTools"],
): SessionRuntimeSummary["slowestStep"] {
  const topTool = topTools[0];
  if (!topTool && modelWaitDurationMsTotal <= 0) {
    return {
      key: "none",
      label: "no timed runtime activity yet",
      durationMsTotal: 0,
    };
  }

  if (!topTool || modelWaitDurationMsTotal >= topTool.durationMsTotal) {
    return {
      key: "model_wait",
      label: "model wait",
      durationMsTotal: modelWaitDurationMsTotal,
    };
  }

  return {
    key: `tool:${topTool.name}`,
    label: `tool ${topTool.name}`,
    durationMsTotal: topTool.durationMsTotal,
  };
}
