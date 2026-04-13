import type { ManagedTurnOptions } from "../agent/turn.js";
import type { RunTurnResult, AgentCallbacks, AgentIdentity } from "../agent/types.js";
import type { SessionStoreLike } from "../agent/session.js";
import type { RegisteredTool, ToolRegistry } from "../tools/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

export interface HostToolRegistryOptions {
  extraTools?: readonly RegisteredTool[];
}

export type HostManagedTurnRunner = (options: ManagedTurnOptions) => Promise<RunTurnResult>;

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
  extraTools?: readonly RegisteredTool[];
}

export interface HostTurnDependencies {
  runTurn?: HostManagedTurnRunner;
  createToolRegistry?: (config: RuntimeConfig, options: HostToolRegistryOptions) => Promise<ToolRegistry>;
  onRunTurnStarted?: () => void;
}

export interface HostTurnOutcome {
  status: "completed" | "paused" | "aborted" | "failed";
  session: SessionRecord;
  result?: RunTurnResult;
  pauseReason?: string;
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
