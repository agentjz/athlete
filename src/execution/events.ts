import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type { ExecutionRecord } from "./types.js";

const EXECUTION_EVENT_DIR = path.join(".deadmouse", "execution-events");

export interface ExecutionLifecycleEvent {
  protocol: "deadmouse.execution-event.v1";
  event: "execution.closed";
  executionId: string;
  requestedBy: string;
  profile: ExecutionRecord["profile"];
  status: ExecutionRecord["status"];
  objectiveKey?: string;
  taskId?: number;
  createdAt: string;
}

export interface ExecutionEventCursor {
  latestEventName?: string;
}

export async function publishExecutionClosedEvent(rootDir: string, execution: ExecutionRecord): Promise<void> {
  const event: ExecutionLifecycleEvent = {
    protocol: "deadmouse.execution-event.v1",
    event: "execution.closed",
    executionId: execution.id,
    requestedBy: execution.requestedBy,
    profile: execution.profile,
    status: execution.status,
    objectiveKey: execution.objectiveKey,
    taskId: execution.taskId,
    createdAt: new Date().toISOString(),
  };
  const eventDir = getExecutionEventDir(rootDir);
  await fsp.mkdir(eventDir, { recursive: true });
  const eventPath = path.join(eventDir, `${Date.now()}-${process.pid}-${sanitizeExecutionId(execution.id)}.json`);
  await fsp.writeFile(eventPath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function snapshotExecutionEventCursor(rootDir: string): Promise<ExecutionEventCursor> {
  const eventDir = getExecutionEventDir(rootDir);
  await fsp.mkdir(eventDir, { recursive: true });
  return {
    latestEventName: await readLatestEventName(eventDir),
  };
}

export async function waitForExecutionEventAfter(input: {
  rootDir: string;
  cursor: ExecutionEventCursor;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const eventDir = getExecutionEventDir(input.rootDir);
  await fsp.mkdir(eventDir, { recursive: true });

  if (await hasEventAfter(eventDir, input.cursor)) {
    return;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let watcher: fs.FSWatcher | undefined;

    const settle = (error?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      watcher?.close();
      input.abortSignal?.removeEventListener("abort", onAbort);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const onAbort = (): void => settle(new Error("Delegated work wait was aborted."));

    if (input.abortSignal?.aborted) {
      onAbort();
      return;
    }

    try {
      watcher = fs.watch(eventDir, () => {
        void hasEventAfter(eventDir, input.cursor).then((changed) => {
          if (changed) {
            settle();
          }
        }, settle);
      });
    } catch (error) {
      settle(error);
      return;
    }

    void hasEventAfter(eventDir, input.cursor).then((changed) => {
      if (changed) {
        settle();
      }
    }, settle);

    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getExecutionEventDir(rootDir: string): string {
  return path.join(rootDir, EXECUTION_EVENT_DIR);
}

function sanitizeExecutionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "execution";
}

async function hasEventAfter(eventDir: string, cursor: ExecutionEventCursor): Promise<boolean> {
  const latest = await readLatestEventName(eventDir);
  if (!latest) {
    return false;
  }
  return !cursor.latestEventName || latest > cursor.latestEventName;
}

async function readLatestEventName(eventDir: string): Promise<string | undefined> {
  const names = await fsp.readdir(eventDir).catch(() => []);
  return names.filter((name) => name.endsWith(".json")).sort().at(-1);
}
