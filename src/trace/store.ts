import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import { buildAgentTraceEventRecord, type AgentTraceEventInput, type AgentTraceEventRecord } from "./schema.js";

const TRACE_FILE_SUFFIX = ".jsonl";

export async function appendAgentTraceEvent(
  rootDir: string,
  input: AgentTraceEventInput,
): Promise<AgentTraceEventRecord> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.tracesDir, { recursive: true });
  const filePath = getSessionTraceFilePath(paths.tracesDir, input.sessionId);
  const sequence = await readNextSequence(filePath);
  const record = buildAgentTraceEventRecord(sequence, input);
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function recordAgentTraceEvent(rootDir: string, input: AgentTraceEventInput): Promise<void> {
  try {
    await appendAgentTraceEvent(rootDir, input);
  } catch {
    // Trace is a side-channel dossier. It must not change formal runtime semantics.
  }
}

export async function readAgentTraceEvents(
  rootDir: string,
  sessionId: string,
): Promise<AgentTraceEventRecord[]> {
  const filePath = getSessionTraceFilePath(getProjectStatePaths(rootDir).tracesDir, sessionId);
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  const events: AgentTraceEventRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      events.push(JSON.parse(trimmed) as AgentTraceEventRecord);
    } catch {
      // Skip malformed side-channel lines.
    }
  }
  return events.sort((left, right) => left.sequence - right.sequence);
}

export async function listAgentTraceSessions(rootDir: string): Promise<Array<{
  sessionId: string;
  eventCount: number;
  updatedAt?: string;
}>> {
  const tracesDir = getProjectStatePaths(rootDir).tracesDir;
  const entries = await fs.readdir(tracesDir, { withFileTypes: true }).catch(() => []);
  const sessions: Array<{ sessionId: string; eventCount: number; updatedAt?: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(TRACE_FILE_SUFFIX)) {
      continue;
    }

    const sessionId = entry.name.slice(0, -TRACE_FILE_SUFFIX.length);
    const events = await readAgentTraceEvents(rootDir, sessionId);
    sessions.push({
      sessionId,
      eventCount: events.length,
      updatedAt: events.at(-1)?.timestamp,
    });
  }

  return sessions.sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
}

function getSessionTraceFilePath(tracesDir: string, sessionId: string): string {
  return path.join(tracesDir, `${sanitizePathSegment(sessionId)}${TRACE_FILE_SUFFIX}`);
}

async function readNextSequence(filePath: string): Promise<number> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return 1;
  }

  let lastSequence = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as { sequence?: unknown };
      if (typeof parsed.sequence === "number" && Number.isFinite(parsed.sequence)) {
        lastSequence = Math.max(lastSequence, Math.trunc(parsed.sequence));
      }
    } catch {
      // ignore malformed side-channel lines
    }
  }
  return lastSequence + 1;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "unknown-session";
}
