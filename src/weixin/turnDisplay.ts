import type { AgentCallbacks } from "../agent/types.js";

export interface WeixinTurnDisplayScheduler {
  cancel(): void;
}

export class WeixinTurnDisplay {
  public readonly callbacks: AgentCallbacks;
  private readonly pending: Promise<unknown>[] = [];
  private typingHandle: WeixinTurnDisplayScheduler | null = null;
  private assistantText = "";
  private finalizedAssistantText: string | null = null;
  private progressTail = Promise.resolve();
  private lastStageText = "";
  private finalReplyQueued = false;

  constructor(
    private readonly options: {
      userId: string;
      sendTyping: (userId: string) => Promise<void>;
      sendProgressMessage?: (userId: string, text: string) => Promise<{ userId: string; messageId: number }>;
      enqueueReply: (target: { userId: string }, text: string) => Promise<void>;
      typingIntervalMs: number;
      scheduleTypingTick?: (
        callback: () => Promise<void> | void,
        intervalMs: number,
      ) => WeixinTurnDisplayScheduler;
    },
  ) {
    this.callbacks = {
      onModelWaitStart: () => {
        this.ensureTypingLoop();
      },
      onStatus: () => {
        this.ensureTypingLoop();
      },
      onAssistantDelta: (delta) => {
        this.ensureTypingLoop();
        this.assistantText += delta;
      },
      onAssistantText: (text) => {
        this.ensureTypingLoop();
        this.assistantText = text;
        this.finalizedAssistantText = text;
      },
      onAssistantDone: (text) => {
        this.ensureTypingLoop();
        if (text) {
          this.assistantText = text;
          this.finalizedAssistantText = text;
        }
      },
      onReasoningDelta: () => {
        this.ensureTypingLoop();
      },
      onReasoning: () => {
        this.ensureTypingLoop();
      },
      onToolCall: (name) => {
        this.ensureTypingLoop();
        this.emitTool(name);
      },
      onToolResult: (name, output) => {
        if (name === "todo_write") {
          this.emitTodo(output);
        }
      },
      onToolError: (name) => {
        this.ensureTypingLoop();
        this.emitToolError(name);
      },
      onModelWaitStop: () => {
        return;
      },
    };
  }

  async flush(): Promise<void> {
    this.stopTypingLoop();
    const text = this.finalizedAssistantText ?? this.assistantText;
    if (text && !this.finalReplyQueued) {
      this.finalReplyQueued = true;
      this.pending.push(this.options.enqueueReply({ userId: this.options.userId }, text));
    }
    await this.progressTail.catch(() => undefined);

    if (this.pending.length === 0) {
      return;
    }

    const tasks = this.pending.splice(0, this.pending.length);
    await Promise.all(tasks);
  }

  dispose(): void {
    this.stopTypingLoop();
  }

  noteTerminalState(): void {
    return;
  }

  private ensureTypingLoop(): void {
    if (this.typingHandle) {
      return;
    }

    this.pending.push(this.options.sendTyping(this.options.userId).catch(() => undefined));
    this.typingHandle = (this.options.scheduleTypingTick ?? scheduleTypingTick)(
      () => this.options.sendTyping(this.options.userId).catch(() => undefined),
      this.options.typingIntervalMs,
    );
  }

  private stopTypingLoop(): void {
    this.typingHandle?.cancel();
    this.typingHandle = null;
  }

  private emitTool(name: string): void {
    const normalized = normalizeStageText(name);
    if (!normalized) {
      return;
    }

    this.enqueueStageMessage(normalized);
  }

  private emitToolError(name: string): void {
    const normalized = normalizeStageText(name);
    if (!normalized) {
      return;
    }

    this.enqueueStageMessage(`${normalized} failed`);
  }

  private emitTodo(rawOutput: string): void {
    const preview = extractTodoPreview(rawOutput);
    if (!preview) {
      return;
    }

    this.enqueueStageMessage(preview);
  }

  private enqueueStageMessage(text: string): void {
    if (!this.options.sendProgressMessage || text === this.lastStageText) {
      return;
    }

    this.progressTail = this.progressTail
      .catch(() => undefined)
      .then(async () => {
        const sent = await this.options.sendProgressMessage?.(this.options.userId, text);
        if (sent) {
          this.lastStageText = text;
        }
      })
      .catch(() => undefined);
    this.pending.push(this.progressTail);
  }
}

function scheduleTypingTick(
  callback: () => Promise<void> | void,
  intervalMs: number,
): WeixinTurnDisplayScheduler {
  const handle = setInterval(() => {
    void callback();
  }, intervalMs);

  return {
    cancel() {
      clearInterval(handle);
    },
  };
}

function normalizeStageText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}

function extractTodoPreview(rawOutput: string): string | null {
  try {
    const parsed = JSON.parse(rawOutput) as { preview?: unknown };
    if (typeof parsed.preview === "string" && parsed.preview.trim()) {
      return parsed.preview.trim();
    }
  } catch {
    return null;
  }

  return null;
}
