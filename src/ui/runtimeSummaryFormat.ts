import { buildSessionRuntimeSummary } from "../agent/runtimeMetrics.js";
import type { SessionRuntimeSummary } from "../agent/runtimeMetrics.js";

export function formatHealth(status: string, reasons: string[]): string {
  if (reasons.length === 0) {
    return status;
  }

  return `${status} (${reasons.join("; ")})`;
}

export function formatUsage(summary: ReturnType<typeof buildSessionRuntimeSummary>): string {
  if (summary.usage.availability === "unavailable") {
    return `unavailable (${summary.usage.requestsWithoutUsage}/${summary.modelRequests || summary.usage.requestsWithoutUsage} requests)`;
  }

  const totals = `input=${summary.usage.inputTokensTotal} output=${summary.usage.outputTokensTotal} total=${summary.usage.totalTokensTotal}`;
  if (summary.usage.availability === "partial") {
    return `partial (${totals}; unavailable on ${summary.usage.requestsWithoutUsage} request(s))`;
  }

  return totals + (summary.usage.reasoningTokensTotal > 0 ? ` reasoning=${summary.usage.reasoningTokensTotal}` : "");
}

export function formatVerification(summary: SessionRuntimeSummary): string {
  const observed = summary.durableTruth.verification.observedPaths.slice(0, 3).join(", ");
  return observed
    ? `${summary.durableTruth.verification.status} (${observed})`
    : summary.durableTruth.verification.status;
}

export function formatSlowFactors(summary: SessionRuntimeSummary): string {
  const factors = summary.derivedDiagnostics.performance.whySlow.slice(0, 3).map((entry) => entry.summary);
  return factors.length > 0 ? factors.join(" | ") : "No timed bottleneck recorded yet.";
}

export function formatPromptLayers(summary: SessionRuntimeSummary): string {
  const prompt = summary.derivedDiagnostics.prompt;
  if (!prompt) {
    return "unavailable";
  }

  return `static=${prompt.staticChars}/${prompt.staticBlockCount}, profile=${prompt.profileChars}/${prompt.profileBlockCount}, runtimeFacts=${prompt.runtimeFactChars}/${prompt.runtimeFactBlockCount}, total=${prompt.totalChars}`;
}

export function formatPromptHotspot(summary: SessionRuntimeSummary): string {
  const prompt = summary.derivedDiagnostics.prompt;
  const hotspot = prompt?.hotspots[0];
  if (!prompt || !hotspot) {
    return "unavailable";
  }

  return `${hotspot.title} [${hotspot.layer}, ${hotspot.chars} chars]; ${prompt.slimmingSummary}`;
}

export function formatDuration(durationMs: number): string {
  if (durationMs >= 1_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${durationMs}ms`;
}

export function formatBytes(byteLength: number): string {
  if (byteLength >= 1_048_576) {
    return `${(byteLength / 1_048_576).toFixed(2)} MB`;
  }
  if (byteLength >= 1_024) {
    return `${(byteLength / 1_024).toFixed(1)} KB`;
  }

  return `${byteLength} B`;
}
