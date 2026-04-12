import { buildSessionRuntimeSummary } from "../agent/runtimeMetrics.js";
import type { RuntimePromptDiagnostics, SessionRuntimeSummary } from "../agent/runtimeMetrics.js";
import type { SessionRecord } from "../types.js";
import {
  formatBytes,
  formatDuration,
  formatHealth,
  formatPromptHotspot,
  formatPromptLayers,
  formatSlowFactors,
  formatUsage,
  formatVerification,
} from "./runtimeSummaryFormat.js";

export function formatSessionRuntimeSummary(
  session: Pick<SessionRecord, "runtimeStats" | "checkpoint" | "verificationState">,
  options: {
    promptDiagnostics?: RuntimePromptDiagnostics;
  } = {},
): string {
  const summary = buildSessionRuntimeSummary(session, options);
  const lines = [
    "Current runtime:",
    `- Health: ${formatHealth(summary.health.status, summary.health.reasons)}`,
    `- Waiting on: ${formatWaitingOn(summary)}`,
    `- Recent activity: ${formatRecentActivity(summary)}`,
    `- Verification: ${formatVerification(summary)}`,
    `- Model requests: ${summary.modelRequests}`,
    `- Model wait total: ${formatDuration(summary.modelWaitDurationMsTotal)}`,
    `- Usage: ${formatUsage(summary)}`,
    `- Tool calls: ${summary.toolCalls}`,
    `- Tool duration total: ${formatDuration(summary.toolDurationMsTotal)}`,
    `- Recovery events: ${summary.recoveries}`,
    `- Externalized results: ${summary.externalizedResults.count} (${formatBytes(summary.externalizedResults.byteLengthTotal)})`,
    "",
    "Diagnostics:",
    `- Slowest step: ${summary.slowestStep.label} (${formatDuration(summary.slowestStep.durationMsTotal)})`,
    `- Why slow: ${formatSlowFactors(summary)}`,
    `- Prompt hotspot: ${formatPromptHotspot(summary)}`,
  ];

  if (summary.derivedDiagnostics.prompt) {
    lines.push(`- Prompt layers: ${formatPromptLayers(summary)}`);
  }

  if (summary.derivedDiagnostics.performance.flakyTools.length > 0) {
    const tool = summary.derivedDiagnostics.performance.flakyTools[0];
    if (tool) {
      lines.push(`- Flaky tool hotspot: ${tool.name} failed ${tool.errorCount}/${tool.callCount} call(s)`);
    }
  }

  if (summary.topTools.length > 0) {
    lines.push("- Top tools:");
    for (const tool of summary.topTools.slice(0, 5)) {
      lines.push(
        `  ${tool.name}: ${tool.callCount} call(s), ${formatDuration(tool.durationMsTotal)}, ok=${tool.okCount}, error=${tool.errorCount}`,
      );
    }
  }

  return lines.join("\n");
}

function formatWaitingOn(summary: SessionRuntimeSummary): string {
  const transition = summary.durableTruth.checkpoint.lastTransition;
  if (transition?.action === "pause" && transition.reason.code === "pause.verification_awaiting_user") {
    return `verification (waiting for user on ${formatPathList(transition.reason.pendingPaths)})`;
  }

  if (transition?.action === "pause" && transition.reason.code === "pause.orchestrator_waiting_for_delegated_work") {
    return "delegated work completion";
  }

  if (summary.durableTruth.checkpoint.phase === "recovery" || transition?.action === "recover") {
    return "provider recovery";
  }

  if (summary.durableTruth.verification.status === "required") {
    return `verification (${formatPathList(summary.durableTruth.verification.pendingPaths)})`;
  }

  if (transition?.action === "yield") {
    return "managed continuation";
  }

  if (summary.modelRequests === 0 && summary.toolCalls === 0) {
    return "first request";
  }

  return "next turn decision";
}

function formatRecentActivity(summary: SessionRuntimeSummary): string {
  const transition = summary.durableTruth.checkpoint.lastTransition;
  if (transition?.action === "pause" && transition.reason.code === "pause.orchestrator_waiting_for_delegated_work") {
    return transition.reason.pauseReason;
  }

  if (transition?.action === "pause") {
    return "Verification paused and is waiting for explicit user input.";
  }

  if (transition?.action === "recover") {
    return summary.derivedDiagnostics.controlFlow.whyRecovery.summary;
  }

  if (transition?.action === "continue" || transition?.action === "yield") {
    return summary.derivedDiagnostics.controlFlow.whyContinue.summary;
  }

  if (transition?.action === "finalize") {
    return "Runtime reached finalize and closed the current turn.";
  }

  return "Runtime has not recorded a structured transition yet.";
}

function formatPathList(paths: string[]): string {
  const items = paths.filter(Boolean).slice(0, 2);
  if (items.length === 0) {
    return "current task outputs";
  }

  const extra = paths.length - items.length;
  return extra > 0 ? `${items.join(", ")} (+${extra} more)` : items.join(", ");
}
