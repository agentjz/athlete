import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import type { ObservabilityEventRecord } from "./schema.js";

export interface ObservabilityFailureSummary {
  timestamp: string;
  summary: string;
}

export interface ObservabilitySlowSummary {
  label: string;
  count: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

export interface ObservabilityReport {
  observabilityDir: string;
  latestEventFile: string | null;
  crashCount: number;
  recentFailures: ObservabilityFailureSummary[];
  slowEvents: ObservabilitySlowSummary[];
}

export async function buildObservabilityReport(rootDir: string): Promise<ObservabilityReport> {
  const paths = getProjectStatePaths(rootDir);
  const eventFiles = await listFiles(paths.observabilityEventsDir);
  const crashFiles = await listFiles(paths.observabilityCrashesDir);
  const recentEvents = await readRecentEvents(eventFiles.slice(-3));

  return {
    observabilityDir: paths.observabilityDir,
    latestEventFile: eventFiles.at(-1) ?? null,
    crashCount: crashFiles.length,
    recentFailures: buildFailureSummaries(recentEvents),
    slowEvents: buildSlowSummaries(recentEvents),
  };
}

async function readRecentEvents(eventFiles: string[]): Promise<ObservabilityEventRecord[]> {
  const events: ObservabilityEventRecord[] = [];

  for (const filePath of eventFiles) {
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        events.push(JSON.parse(trimmed) as ObservabilityEventRecord);
      } catch {
        // Skip malformed side-channel lines.
      }
    }
  }

  return events.slice(-200);
}

function buildFailureSummaries(events: ObservabilityEventRecord[]): ObservabilityFailureSummary[] {
  return events
    .filter((event) => event.status === "failed")
    .slice(-5)
    .reverse()
    .map((event) => ({
      timestamp: event.timestamp,
      summary: summarizeFailure(event),
    }));
}

function buildSlowSummaries(events: ObservabilityEventRecord[]): ObservabilitySlowSummary[] {
  const buckets = new Map<string, { count: number; total: number; max: number }>();

  for (const event of events) {
    if (typeof event.durationMs !== "number" || event.durationMs < 0) {
      continue;
    }

    const label = buildSpeedLabel(event);
    const bucket = buckets.get(label) ?? { count: 0, total: 0, max: 0 };
    bucket.count += 1;
    bucket.total += event.durationMs;
    bucket.max = Math.max(bucket.max, event.durationMs);
    buckets.set(label, bucket);
  }

  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      count: bucket.count,
      avgDurationMs: Math.round(bucket.total / Math.max(1, bucket.count)),
      maxDurationMs: bucket.max,
    }))
    .sort((left, right) =>
      right.avgDurationMs - left.avgDurationMs ||
      right.maxDurationMs - left.maxDurationMs ||
      left.label.localeCompare(right.label),
    )
    .slice(0, 5);
}

function summarizeFailure(event: ObservabilityEventRecord): string {
  const subject = buildSpeedLabel(event);
  const target = event.host ? `host=${event.host}` : event.sessionId ? `session=${event.sessionId}` : "";
  const error = event.error?.message ?? "unknown error";
  return [subject, target, error].filter(Boolean).join(" | ");
}

function buildSpeedLabel(event: ObservabilityEventRecord): string {
  if (event.event === "tool.execution") {
    return `tool ${event.toolName ?? "unknown"}`;
  }

  if (event.event === "model.request") {
    const provider = String((event.details as Record<string, unknown> | undefined)?.provider ?? "provider");
    return `model ${provider}/${event.model ?? "unknown"}`;
  }

  if (event.event === "host.turn") {
    return `host turn ${event.host ?? "unknown"}`;
  }

  if (event.event === "execution.lifecycle") {
    const profile = String((event.details as Record<string, unknown> | undefined)?.profile ?? "execution");
    return `execution ${profile}`;
  }

  if (event.event === "host.message") {
    const deliveryKind = String((event.details as Record<string, unknown> | undefined)?.deliveryKind ?? "message");
    return `host message ${deliveryKind}`;
  }

  return event.event;
}

async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}
