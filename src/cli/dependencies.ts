import type { SessionStore } from "../agent/session.js";
import type { resolveCliRuntime } from "./runtime.js";
import type { OneShotPromptRunResult } from "./oneShot.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

export interface CliProgramDependencies {
  startInteractive?: (options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: SessionStore;
  }) => Promise<void>;
  createTelegramService?: (options: {
    cwd: string;
    config: RuntimeConfig;
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
  }) => Promise<OneShotPromptRunResult>;
  acquireProcessLock?: (options: { stateDir: string }) => Promise<{
    pidFilePath: string;
    release(): Promise<void>;
  }>;
  loginWeixin?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<void>;
  createWeixinService?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  logoutWeixin?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<void>;
  acquireWeixinProcessLock?: (options: { stateDir: string }) => Promise<{
    pidFilePath: string;
    release(): Promise<void>;
  }>;
  resolveRuntime?: typeof resolveCliRuntime;
}
