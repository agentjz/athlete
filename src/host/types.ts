import type { RunTurnOptions } from "../agent/turn.js";
import type { RunTurnResult, AgentCallbacks, AgentIdentity } from "../agent/types.js";
import type { SessionStoreLike } from "../session/index.js";
import type { RegisteredTool, ToolFilter, ToolRegistry } from "../tools/core/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { HostToolRegistryOptions } from "./toolRegistry.js";

export type HostTurnRunner = (options: RunTurnOptions) => Promise<RunTurnResult>;

export interface HostTurnOptions {
  host?: string;
  input: string;
  cwd: string;
  stateRootDir?: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  identity?: AgentIdentity;
  builtinToolFilter?: ToolFilter;
  extraTools?: readonly RegisteredTool[];
  runtimePromptState?: RunTurnOptions["runtimePromptState"];
}

export interface HostTurnDependencies {
  runTurn?: HostTurnRunner;
  createToolRegistry?: (config: RuntimeConfig, options?: HostToolRegistryOptions) => Promise<ToolRegistry>;
  onRunTurnStarted?: () => void;
}

export interface HostTurnOutcome {
  status: "completed" | "aborted" | "failed";
  session: SessionRecord;
  result?: RunTurnResult;
  errorMessage?: string;
  error?: unknown;
}

export interface HostSessionBindingLike {
  sessionId: string;
}

export interface LoadSessionOrCreateOptions {
  cwd: string;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  sessionId: string;
  onRecreated?: (session: SessionRecord) => Promise<void>;
}

export interface EnsureBoundSessionOptions<TBinding extends HostSessionBindingLike> {
  cwd: string;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  loadBinding: () => Promise<TBinding | null>;
  createBinding: (session: SessionRecord) => TBinding;
  touchBinding: (binding: TBinding, sessionId: string) => TBinding;
  saveBinding: (binding: TBinding) => Promise<void>;
}

export interface PersistBoundSessionOptions<TBinding extends HostSessionBindingLike> {
  binding: TBinding;
  sessionId: string;
  touchBinding: (binding: TBinding, sessionId: string) => TBinding;
  saveBinding: (binding: TBinding) => Promise<void>;
}
