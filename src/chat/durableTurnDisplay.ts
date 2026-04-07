import type { AgentCallbacks } from "../agent/types.js";
import { createVisibleTurnCallbacks, type VisibleTurnEvent } from "./visibleEvents.js";

export interface DurableTurnDisplayScheduler {
  cancel(): void;
}

export class DurableTurnDisplay<TTarget> {
  public readonly callbacks: AgentCallbacks;
  private readonly typingTasks: Promise<unknown>[] = [];
  private typingHandle: DurableTurnDisplayScheduler | null = null;
  private visibleTail = Promise.resolve();
  private visibleFailure: unknown = null;
  private visibleVersion = 0;

  constructor(
    private readonly options: {
      target: TTarget;
      sendTyping: (target: TTarget) => Promise<void>;
      enqueueVisibleMessage: (target: TTarget, text: string) => Promise<void>;
      shouldEmitEvent?: (event: VisibleTurnEvent) => boolean;
      typingIntervalMs: number;
      scheduleTypingTick?: (
        callback: () => Promise<void> | void,
        intervalMs: number,
      ) => DurableTurnDisplayScheduler;
    },
  ) {
    this.callbacks = createVisibleTurnCallbacks({
      onActivity: () => {
        this.ensureTypingLoop();
      },
      onVisibleEvent: (event) => {
        this.enqueueVisibleText(event.text);
      },
      shouldEmitEvent: options.shouldEmitEvent,
    });
  }

  async flush(): Promise<void> {
    this.stopTypingLoop();
    await this.waitForDurableVisible();
    await this.waitForTyping();
  }

  dispose(): void {
    this.stopTypingLoop();
  }

  noteTerminalState(): void {
    return;
  }

  async waitForDurableVisible(): Promise<void> {
    while (true) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const visibleVersion = this.visibleVersion;
      const visibleTail = this.visibleTail;
      await visibleTail;

      if (this.visibleFailure) {
        throw this.visibleFailure;
      }

      if (visibleVersion === this.visibleVersion) {
        return;
      }
    }
  }

  private ensureTypingLoop(): void {
    if (this.typingHandle) {
      return;
    }

    this.typingTasks.push(this.options.sendTyping(this.options.target).catch(() => undefined));
    this.typingHandle = (this.options.scheduleTypingTick ?? scheduleTypingTick)(
      () => this.options.sendTyping(this.options.target).catch(() => undefined),
      this.options.typingIntervalMs,
    );
  }

  private stopTypingLoop(): void {
    this.typingHandle?.cancel();
    this.typingHandle = null;
  }

  private enqueueVisibleText(text: string): void {
    this.visibleVersion += 1;
    this.visibleTail = this.visibleTail.then(async () => {
      if (this.visibleFailure) {
        return;
      }

      try {
        await this.options.enqueueVisibleMessage(this.options.target, text);
      } catch (error) {
        this.visibleFailure ??= error;
      }
    });
  }

  private async waitForTyping(): Promise<void> {
    if (this.typingTasks.length === 0) {
      return;
    }

    await Promise.all(this.typingTasks);
  }
}

function scheduleTypingTick(
  callback: () => Promise<void> | void,
  intervalMs: number,
): DurableTurnDisplayScheduler {
  const handle = setInterval(() => {
    void callback();
  }, intervalMs);

  return {
    cancel() {
      clearInterval(handle);
    },
  };
}
