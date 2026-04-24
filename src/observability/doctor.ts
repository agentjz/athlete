import path from "node:path";

import type { ObservabilityReport } from "./report.js";

export function formatObservabilityDoctorReport(report: ObservabilityReport): string[] {
  const lines = [
    "Deadmouse doctor observability",
    `observability path: ${report.observabilityDir}`,
    `recent event file: ${report.latestEventFile ?? "none yet"}`,
    `recent crashes: ${report.crashCount}`,
  ];

  if (report.recentFailures.length > 0) {
    lines.push("recent failures:");
    for (const failure of report.recentFailures) {
      lines.push(`- ${failure.timestamp} ${failure.summary}`);
    }
  } else {
    lines.push("recent failures: none");
  }

  if (report.slowEvents.length > 0) {
    lines.push("slowest recent event groups:");
    for (const event of report.slowEvents) {
      lines.push(
        `- ${event.label} avg=${formatDuration(event.avgDurationMs)} max=${formatDuration(event.maxDurationMs)} count=${event.count}`,
      );
    }
  } else {
    lines.push("slowest recent event groups: none");
  }

  return lines.map((line) => normalizePathForDisplay(line));
}

function formatDuration(durationMs: number): string {
  if (durationMs >= 1_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${durationMs}ms`;
}

function normalizePathForDisplay(value: string): string {
  return value.split(path.sep).join(path.sep);
}
