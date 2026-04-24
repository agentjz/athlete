import type { AgentCallbacks } from "../agent/types.js";
import type { RuntimeConfig } from "../types.js";

export type ShellInputResult =
  | { kind: "submit"; value: string }
  | { kind: "closed" };

export type ShellMultilineInputResult =
  | { kind: "submit"; value: string }
  | { kind: "cancel" }
  | { kind: "closed" };

export interface ShellInputPort {
  readInput(promptLabel?: string): Promise<ShellInputResult>;
  readMultiline(promptLabel?: string): Promise<ShellMultilineInputResult>;
  bindInterrupt(handler: () => void): () => void;
}

export interface ShellOutputPort {
  plain(text: string): void;
  info(text: string): void;
  warn(text: string): void;
  error(text: string): void;
  dim(text: string): void;
  heading(text: string): void;
  tool(text: string): void;
  interrupt(text: string): void;
}

export interface InteractionTurnDisplay {
  callbacks: AgentCallbacks;
  flush(): void;
  dispose(): void;
}

export interface InteractionShell {
  input: ShellInputPort;
  output: ShellOutputPort;
  createTurnDisplay(options: {
    cwd: string;
    config: RuntimeConfig;
    abortSignal: AbortSignal;
  }): InteractionTurnDisplay;
  dispose?(): void;
}
