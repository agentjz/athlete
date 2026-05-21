import path from "node:path";

import { recordObservabilityEvent } from "./writer.js";
import { PROJECT_STATE_DIR_NAME } from "../project/statePaths.js";

export interface HostIdentityInput {
  identityKind?: string;
  identityName?: string;
}

export async function recordHostTurnStarted(
  rootDir: string,
  input: {
    host: string;
    sessionId: string;
    cwd: string;
  } & HostIdentityInput,
): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "host.turn",
    status: "started",
    host: input.host,
    sessionId: input.sessionId,
    identityKind: input.identityKind,
    identityName: input.identityName,
    details: {
      cwd: input.cwd,
    },
  });
}

export async function recordHostTurnFinished(
  rootDir: string,
  input: {
    host: string;
    sessionId: string;
    status: "completed" | "aborted" | "failed";
    durationMs: number;
    cwd: string;
    error?: unknown;
    details?: Record<string, unknown>;
  } & HostIdentityInput,
): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "host.turn",
    status: input.status,
    host: input.host,
    sessionId: input.sessionId,
    identityKind: input.identityKind,
    identityName: input.identityName,
    durationMs: input.durationMs,
    error: input.error,
    details: {
      cwd: input.cwd,
      ...(input.details ?? {}),
    },
  });
}

export function recordHostMessage(
  rootDir: string,
  input: {
    host: string;
    status: "accepted" | "queued" | "failed";
    sessionId?: string;
    details: Record<string, unknown>;
    error?: unknown;
  },
): void {
  void recordObservabilityEvent(rootDir, {
    event: "host.message",
    status: input.status,
    host: input.host,
    sessionId: input.sessionId,
    error: input.error,
    details: input.details,
  });
}

export class QueuedHostMessageRecorder {
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(
    private readonly rootDir: string,
    private readonly host: string,
  ) {}

  queue(
    status: "accepted" | "queued" | "failed",
    details: Record<string, unknown>,
    error?: unknown,
  ): void {
    const task = recordObservabilityEvent(this.rootDir, {
      event: "host.message",
      status,
      host: this.host,
      error,
      details,
    }).finally(() => {
      this.pendingWrites.delete(task);
    });
    this.pendingWrites.add(task);
  }

  async waitForIdle(): Promise<void> {
    while (this.pendingWrites.size > 0) {
      await Promise.allSettled([...this.pendingWrites]);
    }
  }
}

export function resolveHostStateRoot(stateDir: string, fallbackCwd: string): string {
  const kittyDir = path.dirname(stateDir);
  return path.basename(kittyDir).toLowerCase() === PROJECT_STATE_DIR_NAME
    ? path.dirname(kittyDir)
    : fallbackCwd;
}
