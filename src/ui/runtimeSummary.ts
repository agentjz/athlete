import { buildSessionRuntimeSummary } from "../agent/runtimeMetrics.js";
import type { SessionRecord } from "../types.js";

export function formatSessionRuntimeSummary(
  session: Pick<SessionRecord, "runtimeStats" | "checkpoint" | "verificationState">,
): string {
  const summary = buildSessionRuntimeSummary(session);
  const lines = [
    `Health: ${formatHealth(summary.health.status, summary.health.reasons)}`,
    `Model requests: ${summary.modelRequests}`,
    `Model wait total: ${formatDuration(summary.modelWaitDurationMsTotal)}`,
    `Usage: ${formatUsage(summary)}`,
    `Tool calls: ${summary.toolCalls}`,
    `Tool duration total: ${formatDuration(summary.toolDurationMsTotal)}`,
    `Events: yields=${summary.yields} continuations=${summary.continuations} recoveries=${summary.recoveries} compressions=${summary.compressions}`,
    `Externalized results: ${summary.externalizedResults.count} (${formatBytes(summary.externalizedResults.byteLengthTotal)})`,
    `Slowest step: ${summary.slowestStep.label} (${formatDuration(summary.slowestStep.durationMsTotal)})`,
  ];

  if (summary.topTools.length > 0) {
    lines.push("Top tools:");
    for (const tool of summary.topTools.slice(0, 5)) {
      lines.push(
        `- ${tool.name}: ${tool.callCount} call(s), ${formatDuration(tool.durationMsTotal)}, ok=${tool.okCount}, error=${tool.errorCount}`,
      );
    }
  }

  return lines.join("\n");
}

function formatHealth(status: string, reasons: string[]): string {
  if (reasons.length === 0) {
    return status;
  }

  return `${status} (${reasons.join("; ")})`;
}

function formatUsage(summary: ReturnType<typeof buildSessionRuntimeSummary>): string {
  if (summary.usage.availability === "unavailable") {
    return `unavailable (${summary.usage.requestsWithoutUsage}/${summary.modelRequests || summary.usage.requestsWithoutUsage} requests)`;
  }

  const totals = `input=${summary.usage.inputTokensTotal} output=${summary.usage.outputTokensTotal} total=${summary.usage.totalTokensTotal}`;
  if (summary.usage.availability === "partial") {
    return `partial (${totals}; unavailable on ${summary.usage.requestsWithoutUsage} request(s))`;
  }

  return totals + (summary.usage.reasoningTokensTotal > 0 ? ` reasoning=${summary.usage.reasoningTokensTotal}` : "");
}

function formatDuration(durationMs: number): string {
  if (durationMs >= 1_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${durationMs}ms`;
}

function formatBytes(byteLength: number): string {
  if (byteLength >= 1_048_576) {
    return `${(byteLength / 1_048_576).toFixed(2)} MB`;
  }
  if (byteLength >= 1_024) {
    return `${(byteLength / 1_024).toFixed(1)} KB`;
  }

  return `${byteLength} B`;
}
