import type { RuntimeConfig } from "../../types.js";
import type { KittyProductMode } from "./mode.js";

export const EXTENSION_HOOKS = [
  "super.start",
  "prompt.runtime",
  "super.stop",
] as const;

export type ExtensionHookName = typeof EXTENSION_HOOKS[number];

export interface ExtensionHookContext {
  cwd: string;
  config: RuntimeConfig;
  mode: KittyProductMode;
  extensionId: string;
  sessionId: string;
  workspaceRoot: string;
}

export interface ExtensionHookOutput {
  promptBlocks: string[];
  facts: Record<string, unknown>;
}

export interface ExtensionHookRun {
  extensionId: string;
  hook: ExtensionHookName;
  status: "completed" | "failed";
  message?: string;
}

export function createEmptyHookOutput(): ExtensionHookOutput {
  return {
    promptBlocks: [],
    facts: {},
  };
}

export function isExtensionHookName(value: unknown): value is ExtensionHookName {
  return typeof value === "string" && (EXTENSION_HOOKS as readonly string[]).includes(value);
}
