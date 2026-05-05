import type { SessionStore } from "../session/index.js";
import type { resolveCliRuntime } from "./runtime.js";
import type { OneShotPromptRunResult } from "./oneShot.js";
import type { KittyProductMode } from "../extensions/index.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

export interface CliProgramDependencies {
  startInteractive?: (options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
    mode?: KittyProductMode;
  }) => Promise<void>;
  startSpecInteractive?: (options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
    mode?: KittyProductMode;
  }) => Promise<void>;
  createTelegramService?: (options: {
    cwd: string;
    config: RuntimeConfig;
    mode?: KittyProductMode;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  runOneShot?: (options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
    mode?: KittyProductMode;
  }) => Promise<OneShotPromptRunResult>;
  runSpecOneShot?: (options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
    mode?: KittyProductMode;
  }) => Promise<OneShotPromptRunResult>;
  acquireProcessLock?: (options: { stateDir: string }) => Promise<{
    pidFilePath: string;
    release(): Promise<void>;
  }>;
  resolveRuntime?: typeof resolveCliRuntime;
}
