import { buildSessionRuntimeSummary } from "../agent/runtimeMetrics.js";
import type { SessionRecord } from "../types.js";
import type { RuntimePromptDiagnostics, SessionRuntimeSummary } from "../agent/runtimeMetrics.js";
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
    "Durable truth:",
    `- Health: ${formatHealth(summary.health.status, summary.health.reasons)}`,
    `- Checkpoint: status=${summary.durableTruth.checkpoint.status} phase=${summary.durableTruth.checkpoint.phase}`,
    `- Last transition: ${summary.durableTruth.checkpoint.lastTransition?.reason.code ?? "none"}`,
    `- Verification: ${formatVerification(summary)}`,
    `- Model requests: ${summary.modelRequests}`,
    `- Model wait total: ${formatDuration(summary.modelWaitDurationMsTotal)}`,
    `- Usage: ${formatUsage(summary)}`,
    `- Tool calls: ${summary.toolCalls}`,
    `- Tool duration total: ${formatDuration(summary.toolDurationMsTotal)}`,
    `- Events: yields=${summary.yields} continuations=${summary.continuations} recoveries=${summary.recoveries} compressions=${summary.compressions}`,
    `- Externalized results: ${summary.externalizedResults.count} (${formatBytes(summary.externalizedResults.byteLengthTotal)})`,
    "",
    "Derived diagnostics:",
    `- Why continue: ${summary.derivedDiagnostics.controlFlow.whyContinue.summary}`,
    `- Why recovery: ${summary.derivedDiagnostics.controlFlow.whyRecovery.summary}`,
    `- Why compression: ${summary.derivedDiagnostics.controlFlow.whyCompression.summary}`,
    `- Why slow: ${formatSlowFactors(summary)}`,
    `- Slowest step: ${summary.slowestStep.label} (${formatDuration(summary.slowestStep.durationMsTotal)})`,
  ];

  if (summary.derivedDiagnostics.prompt) {
    lines.push(`- Prompt layers: ${formatPromptLayers(summary)}`);
    lines.push(`- Prompt hotspot: ${formatPromptHotspot(summary)}`);
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
