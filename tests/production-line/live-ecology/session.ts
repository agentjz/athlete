import fs from "node:fs/promises";
import path from "node:path";

import { getLiveTaskSessionsDir } from "./sessionCapture.ts";

interface SessionToolCall {
  function?: {
    name?: string;
  };
}

interface SessionMessage {
  role?: string;
  name?: string;
  content?: unknown;
  tool_calls?: SessionToolCall[];
}

interface SessionRecordLike {
  messages?: SessionMessage[];
}

export interface FailedToolSummary {
  tool: string;
  error: string;
}

export async function readSessionRecord(sessionId: string): Promise<SessionRecordLike | null> {
  if (!sessionId) {
    return null;
  }
  const sessionPath = path.join(getLiveTaskSessionsDir(), `${sessionId}.json`);
  const raw = await fs.readFile(sessionPath, "utf8").catch(() => "");
  return raw ? JSON.parse(raw) as SessionRecordLike : null;
}

export function collectCoveredTools(sessionRecord: SessionRecordLike | null): string[] {
  if (!sessionRecord?.messages) {
    return [];
  }
  const names = new Set<string>();
  for (const message of sessionRecord.messages) {
    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (call?.function?.name) {
          names.add(call.function.name);
        }
      }
    }
    if (message?.role === "tool" && typeof message.name === "string") {
      names.add(message.name);
    }
  }
  return [...names].sort();
}

export function collectFailedTools(sessionRecord: SessionRecordLike | null): FailedToolSummary[] {
  if (!sessionRecord?.messages) {
    return [];
  }
  const failures: FailedToolSummary[] = [];
  for (const message of sessionRecord.messages) {
    if (message?.role !== "tool" || typeof message.name !== "string") {
      continue;
    }
    const parsed = safeParse(message.content);
    if (parsed?.ok === false) {
      failures.push({
        tool: message.name,
        error: String(parsed.error ?? parsed.output ?? message.content).slice(0, 300),
      });
    }
  }
  return failures;
}

function safeParse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
