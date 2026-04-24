import path from "node:path";

import { recordObservabilityEvent } from "../../observability/writer.js";

export class TelegramObservabilityWriter {
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(private readonly rootDir: string) {}

  queueHostMessage(
    status: "accepted" | "queued" | "failed",
    details: Record<string, unknown>,
    error?: unknown,
  ): void {
    const task = recordObservabilityEvent(this.rootDir, {
      event: "host.message",
      status,
      host: "telegram",
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
  const deadmouseDir = path.dirname(stateDir);
  return path.basename(deadmouseDir).toLowerCase() === ".deadmouse"
    ? path.dirname(deadmouseDir)
    : fallbackCwd;
}
