import type { AgentCallbacks } from "../agent/types.js";

const HEARTBEAT_MS = 15_000;

export class SubagentProgressReporter {
  private readonly startedAt = Date.now();
  private toolCount = 0;
  private lastPhase = "starting";
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private readonly agentType: string,
    private readonly description: string,
    private readonly callbacks?: AgentCallbacks,
  ) {}

  start(): void {
    this.lastPhase = "thinking";
    this.emit(`started`);
    this.heartbeat = setInterval(() => {
      this.emit(`still running; phase=${this.lastPhase}`);
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  finish(): void {
    this.stopHeartbeat();
    this.emit(`done`);
  }

  fail(error: unknown): void {
    this.stopHeartbeat();
    const message = error instanceof Error ? error.message : String(error);
    this.emit(`failed: ${message}`);
  }

  createCallbacks(): AgentCallbacks {
    return {
      onStatus: (text) => {
        this.lastPhase = truncate(text, 80);
        this.emit(`status=${this.lastPhase}`);
      },
      onToolCall: (name) => {
        this.toolCount += 1;
        this.lastPhase = `tool:${name}`;
        this.emit(`tool=${name}`);
      },
      onToolError: (name) => {
        this.lastPhase = `tool_error:${name}`;
        this.emit(`tool_error=${name}`);
      },
    };
  }

  private emit(event: string): void {
    this.callbacks?.onStatus?.(
      `[subagent ${this.agentType}] ${this.description} ... ${this.toolCount} tools, ${formatElapsed(Date.now() - this.startedAt)}, ${event}`,
    );
  }

  private stopHeartbeat(): void {
    if (!this.heartbeat) {
      return;
    }

    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder}s`;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
