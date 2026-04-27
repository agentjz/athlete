import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const WAKE_SIGNAL_PROTOCOL = "deadmouse.wake-signal.v1" as const;

export type WakeSignalReason = "completed" | "failed" | "budget_exhausted" | "aborted" | "paused";

export interface WakeSignal {
  protocol: typeof WAKE_SIGNAL_PROTOCOL;
  executionId: string;
  reason: WakeSignalReason;
  createdAt: string;
}

export interface WakeSignalSnapshot {
  mtimeMs: number;
  signal?: WakeSignal;
}

const WAKE_SIGNAL_FILE = path.join(".deadmouse", "execution-wake.signal.json");

export async function publishExecutionWakeSignal(rootDir: string, signal: Omit<WakeSignal, "protocol" | "createdAt"> & {
  createdAt?: string;
}): Promise<void> {
  const next: WakeSignal = {
    protocol: WAKE_SIGNAL_PROTOCOL,
    executionId: signal.executionId,
    reason: signal.reason,
    createdAt: signal.createdAt ?? new Date().toISOString(),
  };
  const file = getWakeSignalFile(rootDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(next)}\n`, "utf8");
}

export async function snapshotExecutionWakeSignal(rootDir: string): Promise<WakeSignalSnapshot> {
  const file = getWakeSignalFile(rootDir);
  const [stat, content] = await Promise.all([
    fsp.stat(file).catch(() => undefined),
    fsp.readFile(file, "utf8").catch(() => ""),
  ]);
  return {
    mtimeMs: stat?.mtimeMs ?? 0,
    signal: parseWakeSignal(content),
  };
}

export async function waitForExecutionWakeSignalChange(input: {
  rootDir: string;
  snapshot: WakeSignalSnapshot;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const file = getWakeSignalFile(input.rootDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  if ((await snapshotExecutionWakeSignal(input.rootDir)).mtimeMs > input.snapshot.mtimeMs) {
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
      error ? reject(error) : resolve();
    };

    const onAbort = (): void => settle(new Error("Execution wake signal wait was aborted."));
    if (input.abortSignal?.aborted) {
      onAbort();
      return;
    }

    try {
      watcher = fs.watch(path.dirname(file), () => {
        void snapshotExecutionWakeSignal(input.rootDir).then((next) => {
          if (next.mtimeMs > input.snapshot.mtimeMs) {
            settle();
          }
        }, settle);
      });
    } catch (error) {
      settle(error);
      return;
    }

    void snapshotExecutionWakeSignal(input.rootDir).then((next) => {
      if (next.mtimeMs > input.snapshot.mtimeMs) {
        settle();
      }
    }, settle);
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getWakeSignalFile(rootDir: string): string {
  return path.join(rootDir, WAKE_SIGNAL_FILE);
}

function parseWakeSignal(content: string): WakeSignal | undefined {
  try {
    const parsed = JSON.parse(content) as WakeSignal;
    return parsed?.protocol === WAKE_SIGNAL_PROTOCOL ? parsed : undefined;
  } catch {
    return undefined;
  }
}
