import type { AgentCallbacks } from "../agent/types.js";
import { writeStdout } from "../utils/stdio.js";

const ASCII_BLOCK_FRAMES = ["[■   ]", "[ ■  ]", "[  ■ ]", "[   ■]", "[  ■ ]", "[ ■  ]"] as const;

export interface WaitingSpinner {
  start(): void;
  stop(): void;
  isActive(): boolean;
}

export function createWaitingSpinner(options: {
  label?: string;
  intervalMs?: number;
  enabled?: boolean;
  write?: (text: string) => void;
} = {}): WaitingSpinner {
  const label = options.label ?? "thinking";
  const intervalMs = Math.max(40, options.intervalMs ?? 80);
  const enabled = options.enabled ?? process.stdout.isTTY;
  const frames = ASCII_BLOCK_FRAMES;
  const write = options.write ?? ((text: string) => {
    writeStdout(text);
  });

  let frameIndex = 0;
  let timer: NodeJS.Timeout | null = null;
  let active = false;
  let lastLength = 0;

  const render = (): void => {
    const frame = `${frames[frameIndex]} ${label}`;
    frameIndex = (frameIndex + 1) % frames.length;
    lastLength = frame.length;
    write(`\r${frame}`);
  };

  const clear = (): void => {
    if (lastLength <= 0) {
      return;
    }
    write(`\r${" ".repeat(lastLength)}\r`);
    lastLength = 0;
  };

  return {
    start(): void {
      if (!enabled || active) {
        return;
      }
      active = true;
      render();
      timer = setInterval(render, intervalMs);
      timer.unref?.();
    },
    stop(): void {
      if (!active) {
        return;
      }
      active = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      clear();
    },
    isActive(): boolean {
      return active;
    },
  };
}

export function wrapCallbacksWithSpinnerStop(
  callbacks: AgentCallbacks,
  stopSpinner: () => void,
): AgentCallbacks {
  return {
    onStatus(text) {
      stopSpinner();
      callbacks.onStatus?.(text);
    },
    onAssistantDelta(delta) {
      stopSpinner();
      callbacks.onAssistantDelta?.(delta);
    },
    onAssistantDone(fullText) {
      stopSpinner();
      callbacks.onAssistantDone?.(fullText);
    },
    onAssistantText(text) {
      stopSpinner();
      callbacks.onAssistantText?.(text);
    },
    onReasoningDelta(delta) {
      stopSpinner();
      callbacks.onReasoningDelta?.(delta);
    },
    onReasoning(text) {
      stopSpinner();
      callbacks.onReasoning?.(text);
    },
    onToolCall(name, args) {
      stopSpinner();
      callbacks.onToolCall?.(name, args);
    },
    onToolResult(name, output) {
      stopSpinner();
      callbacks.onToolResult?.(name, output);
    },
    onToolError(name, error) {
      stopSpinner();
      callbacks.onToolError?.(name, error);
    },
  };
}
