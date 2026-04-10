import type { PromptBlockMetric, PromptLayerMetrics } from "../prompt/types.js";
import type { PromptContextDiagnostics } from "../prompt/requestDiagnostics.js";
import type {
  RuntimeTransition,
  SessionCheckpointFlow,
  SessionCheckpointStatus,
  SessionRecord,
  SessionRuntimeStats,
} from "../../types.js";

export interface RuntimePromptDiagnostics {
  compressed: boolean;
  estimatedChars: number;
  promptMetrics?: PromptLayerMetrics;
  contextDiagnostics: PromptContextDiagnostics;
}

export interface RuntimeSummaryExplanation {
  reasonCode?: string;
  summary: string;
}

export interface RuntimeSummarySlowFactor {
  kind: "model_wait" | "tool_execution" | "recovery" | "compression";
  score: number;
  summary: string;
}

export interface RuntimeSummaryFlakyTool {
  name: string;
  callCount: number;
  errorCount: number;
  failureRate: number;
}

export interface RuntimeSummaryPromptView {
  compressed: boolean;
  estimatedRequestChars: number;
  initialEstimatedRequestChars: number;
  maxContextChars: number;
  summaryChars: number;
  staticChars: number;
  dynamicChars: number;
  memoryChars: number;
  staticBlockCount: number;
  dynamicBlockCount: number;
  memoryBlockCount: number;
  totalChars: number;
  hotspots: PromptBlockMetric[];
  slimmingSummary: string;
}

export interface RuntimeSummaryDurableTruth {
  runtimeStatsUpdatedAt: string;
  checkpoint: {
    status: SessionCheckpointStatus;
    phase: SessionCheckpointFlow["phase"];
    lastTransition?: RuntimeTransition;
  };
  verification: {
    status: NonNullable<SessionRecord["verificationState"]>["status"] | "idle";
    pendingPaths: string[];
  };
}

export interface RuntimeSummaryDerivedDiagnostics {
  controlFlow: {
    whyContinue: RuntimeSummaryExplanation;
    whyRecovery: RuntimeSummaryExplanation;
    whyCompression: RuntimeSummaryExplanation;
  };
  performance: {
    whySlow: RuntimeSummarySlowFactor[];
    flakyTools: RuntimeSummaryFlakyTool[];
  };
  prompt?: RuntimeSummaryPromptView;
}

export function buildDurableTruth(
  session: Pick<SessionRecord, "checkpoint" | "verificationState">,
  stats: SessionRuntimeStats,
): RuntimeSummaryDurableTruth {
  return {
    runtimeStatsUpdatedAt: stats.updatedAt,
    checkpoint: {
      status: session.checkpoint?.status ?? "active",
      phase: session.checkpoint?.flow?.phase ?? "active",
      lastTransition: session.checkpoint?.flow?.lastTransition,
    },
    verification: {
      status: session.verificationState?.status ?? "idle",
      pendingPaths: session.verificationState?.pendingPaths ?? [],
    },
  };
}

export function buildDerivedDiagnostics(input: {
  session: Pick<SessionRecord, "checkpoint" | "verificationState">;
  stats: SessionRuntimeStats;
  topTools: Array<{ name: string; callCount: number; durationMsTotal: number; errorCount: number }>;
  promptDiagnostics?: RuntimePromptDiagnostics;
}): RuntimeSummaryDerivedDiagnostics {
  return {
    controlFlow: {
      whyContinue: explainContinuation(input.session.checkpoint?.flow?.lastTransition, input.session.verificationState),
      whyRecovery: explainRecovery(input.session.checkpoint?.flow?.lastTransition, input.stats),
      whyCompression: explainCompression(input.stats, input.promptDiagnostics),
    },
    performance: {
      whySlow: buildSlowFactors(input.stats, input.topTools, input.promptDiagnostics),
      flakyTools: buildFlakyTools(input.stats),
    },
    prompt: buildPromptView(input.promptDiagnostics),
  };
}

function explainContinuation(
  transition: RuntimeTransition | undefined,
  verificationState: SessionRecord["verificationState"],
): RuntimeSummaryExplanation {
  if (transition?.action === "continue" || transition?.action === "yield") {
    return describeTransition(transition);
  }

  if (verificationState?.status === "required") {
    return {
      reasonCode: "continue.verification_required",
      summary: `Verification required paths remain: ${formatPaths(verificationState.pendingPaths)}.`,
    };
  }

  return {
    summary: "No continuation is currently active in durable truth.",
  };
}

function explainRecovery(
  transition: RuntimeTransition | undefined,
  stats: SessionRuntimeStats,
): RuntimeSummaryExplanation {
  if (transition?.action === "recover") {
    return describeTransition(transition);
  }

  if (stats.events.recoveryCount > 0) {
    return {
      summary: `Provider recovery triggered ${stats.events.recoveryCount} time(s) earlier in this session, but the current checkpoint is no longer in recovery.`,
    };
  }

  return {
    summary: "No provider recovery is active or recorded in durable truth.",
  };
}

function explainCompression(
  stats: SessionRuntimeStats,
  promptDiagnostics: RuntimePromptDiagnostics | undefined,
): RuntimeSummaryExplanation {
  const promptView = buildPromptView(promptDiagnostics);
  if (promptView && promptView.initialEstimatedRequestChars > promptView.maxContextChars) {
    return {
      summary: `Prompt compaction was needed because the request grew to ~${promptView.initialEstimatedRequestChars} chars against a ${promptView.maxContextChars}-char limit; hotspot ${formatHotspot(promptView.hotspots[0])}.`,
    };
  }

  if (promptView?.compressed) {
    return {
      summary: `Older turns were summarized to keep the live request lean; current hotspot ${formatHotspot(promptView.hotspots[0])}.`,
    };
  }

  if (stats.events.compressionCount > 0) {
    return {
      summary: `Compression happened ${stats.events.compressionCount} time(s) earlier in this session, but the current prompt estimate fits inside the context budget.`,
    };
  }

  return {
    summary: "No prompt compression is currently needed.",
  };
}

function buildSlowFactors(
  stats: SessionRuntimeStats,
  topTools: Array<{ name: string; callCount: number; durationMsTotal: number; errorCount: number }>,
  promptDiagnostics: RuntimePromptDiagnostics | undefined,
): RuntimeSummarySlowFactor[] {
  const factors: RuntimeSummarySlowFactor[] = [];
  const slowestTool = topTools[0];

  if (stats.model.waitDurationMsTotal > 0) {
    factors.push({
      kind: "model_wait",
      score: stats.model.waitDurationMsTotal,
      summary: `Model wait spent ${formatDuration(stats.model.waitDurationMsTotal)} across ${stats.model.requestCount} request(s).`,
    });
  }

  if (stats.tools.durationMsTotal > 0) {
    factors.push({
      kind: "tool_execution",
      score: stats.tools.durationMsTotal,
      summary: slowestTool
        ? `Tool execution spent ${formatDuration(stats.tools.durationMsTotal)} total; slowest hotspot is ${slowestTool.name} at ${formatDuration(slowestTool.durationMsTotal)}.`
        : `Tool execution spent ${formatDuration(stats.tools.durationMsTotal)} total.`,
    });
  }

  if (stats.events.recoveryCount > 0) {
    factors.push({
      kind: "recovery",
      score: stats.events.recoveryCount * 1_000,
      summary: `Repeated recovery added churn ${stats.events.recoveryCount} time(s).`,
    });
  }

  const promptView = buildPromptView(promptDiagnostics);
  if (promptView && (promptView.compressed || stats.events.compressionCount > 0)) {
    const overflow = Math.max(0, promptView.initialEstimatedRequestChars - promptView.maxContextChars);
    factors.push({
      kind: "compression",
      score: Math.max(overflow, stats.events.compressionCount * 500),
      summary: overflow > 0
        ? `Prompt growth forced compaction from ~${promptView.initialEstimatedRequestChars} chars down to ~${promptView.estimatedRequestChars}.`
        : `Older turns are being summarized to keep the live request near ~${promptView.estimatedRequestChars} chars.`,
    });
  } else if (stats.events.compressionCount > 0) {
    factors.push({
      kind: "compression",
      score: stats.events.compressionCount * 500,
      summary: `Prompt compression has occurred ${stats.events.compressionCount} time(s) in this session.`,
    });
  }

  return factors.sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind));
}

function buildFlakyTools(stats: SessionRuntimeStats): RuntimeSummaryFlakyTool[] {
  return Object.entries(stats.tools.byName)
    .map(([name, tool]) => ({
      name,
      callCount: tool.callCount,
      errorCount: tool.errorCount,
      failureRate: tool.callCount > 0 ? tool.errorCount / tool.callCount : 0,
      durationMsTotal: tool.durationMsTotal,
    }))
    .filter((tool) => tool.errorCount > 0)
    .sort((left, right) =>
      right.errorCount - left.errorCount ||
      right.failureRate - left.failureRate ||
      right.durationMsTotal - left.durationMsTotal ||
      left.name.localeCompare(right.name),
    )
    .map(({ durationMsTotal: _durationMsTotal, ...tool }) => tool);
}

function buildPromptView(
  promptDiagnostics: RuntimePromptDiagnostics | undefined,
): RuntimeSummaryPromptView | undefined {
  if (!promptDiagnostics?.promptMetrics) {
    return undefined;
  }

  const metrics = promptDiagnostics.promptMetrics;
  return {
    compressed: promptDiagnostics.compressed,
    estimatedRequestChars: promptDiagnostics.estimatedChars,
    initialEstimatedRequestChars: promptDiagnostics.contextDiagnostics.initialEstimatedChars,
    maxContextChars: promptDiagnostics.contextDiagnostics.maxContextChars,
    summaryChars: promptDiagnostics.contextDiagnostics.summaryChars,
    staticChars: metrics.staticChars,
    dynamicChars: metrics.dynamicChars,
    memoryChars: metrics.memoryChars,
    staticBlockCount: metrics.staticBlockCount,
    dynamicBlockCount: metrics.dynamicBlockCount,
    memoryBlockCount: metrics.memoryBlockCount,
    totalChars: metrics.totalChars,
    hotspots: metrics.hotspots.slice(0, 5),
    slimmingSummary: describePromptSlimming(metrics, promptDiagnostics),
  };
}

function describePromptSlimming(
  metrics: PromptLayerMetrics,
  promptDiagnostics: RuntimePromptDiagnostics,
): string {
  const dominantLayer = pickDominantLayer(metrics);
  const hotspot = metrics.hotspots[0];
  if (promptDiagnostics.compressed) {
    return `Prompt is dominated by the ${dominantLayer} layer and had to compress; largest block is ${formatHotspot(hotspot)}.`;
  }

  return `Largest prompt hotspot is ${formatHotspot(hotspot)} with the ${dominantLayer} layer contributing the most chars.`;
}

function pickDominantLayer(metrics: PromptLayerMetrics): "static" | "dynamic" | "memory" {
  const layers: Array<{ layer: "static" | "dynamic" | "memory"; chars: number }> = [
    { layer: "static", chars: metrics.staticChars },
    { layer: "dynamic", chars: metrics.dynamicChars },
    { layer: "memory", chars: metrics.memoryChars },
  ];

  return layers.sort((left, right) => right.chars - left.chars || left.layer.localeCompare(right.layer))[0]?.layer ?? "static";
}

function describeTransition(transition: RuntimeTransition): RuntimeSummaryExplanation {
  switch (transition.reason.code) {
    case "continue.after_tool_batch":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime continued after tool batch ${transition.reason.toolNames.join(", ")}.`,
      };
    case "continue.required_skill_load":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime continued because required skills are still missing: ${transition.reason.missingSkills.join(", ")}.`,
      };
    case "continue.incomplete_todos":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime continued because ${transition.reason.incompleteTodoCount} todo item(s) remain incomplete.`,
      };
    case "continue.verification_required":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime continued because verification required paths remain: ${formatPaths(transition.reason.pendingPaths)}.`,
      };
    case "continue.verification_failed":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime continued because the last verification failed${transition.reason.lastCommand ? ` (${transition.reason.lastCommand})` : ""}.`,
      };
    case "continue.resume_from_checkpoint":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime resumed from the persisted checkpoint via ${transition.reason.source === "resume_directive" ? "a resume directive" : "managed continuation"}.`,
      };
    case "recover.provider_request_retry":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime is recovering from provider request failure "${transition.reason.error}" after ${transition.reason.consecutiveFailures} consecutive failure(s).`,
      };
    case "yield.tool_step_limit":
      return {
        reasonCode: transition.reason.code,
        summary: `Managed continuation yielded because tool steps hit ${transition.reason.toolSteps}/${transition.reason.limit ?? transition.reason.toolSteps}.`,
      };
    case "pause.verification_awaiting_user":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime paused because verification is awaiting user input for ${formatPaths(transition.reason.pendingPaths)}.`,
      };
    case "finalize.completed":
      return {
        reasonCode: transition.reason.code,
        summary: `Runtime finalized after completion with verification ${transition.reason.verificationOutcome}.`,
      };
    default:
      return {
        summary: "No structured runtime transition explanation is available.",
      };
  }
}

function formatPaths(paths: string[]): string {
  const items = paths.filter(Boolean).slice(0, 3);
  if (items.length === 0) {
    return "the current task outputs";
  }

  const extra = paths.length - items.length;
  return extra > 0 ? `${items.join(", ")} (+${extra} more)` : items.join(", ");
}

function formatHotspot(hotspot: PromptBlockMetric | undefined): string {
  if (!hotspot) {
    return "none";
  }

  return `${hotspot.title} [${hotspot.layer}, ${hotspot.chars} chars]`;
}

function formatDuration(durationMs: number): string {
  if (durationMs >= 1_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${durationMs}ms`;
}
