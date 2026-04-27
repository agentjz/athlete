import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import type { SessionStoreLike } from "../agent/session.js";
import type { RegisteredTool } from "../capabilities/tools/core/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { runHostTurn } from "./turn.js";
import type { HostTurnDependencies } from "./types.js";

export interface BoundHostTurnDisplay {
  noteTerminalState?(): void;
  flush(): Promise<void>;
  dispose(): void;
}

export interface BoundHostTurnOutput {
  warn(text: string): void;
  error(text: string): void;
  info(text: string): void;
}

export interface BoundHostTurnOptions<TActiveTurn> {
  host?: string;
  buildInput: () => Promise<string>;
  cwd: string;
  stateRootDir?: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  output: BoundHostTurnOutput;
  display: BoundHostTurnDisplay;
  callbacks?: AgentCallbacks;
  extraTools?: readonly RegisteredTool[];
  shouldAbortOnStart?: () => boolean;
  markQueuedTurnStarted: () => void;
  createActiveTurn: (controller: AbortController, sessionId: string) => TActiveTurn;
  onActiveTurnStart: (activeTurn: TActiveTurn) => void;
  onActiveTurnEnd: () => void;
  onCompleted?: (result: RunTurnResult, session: SessionRecord) => void;
  onPaused?: (result: RunTurnResult, session: SessionRecord) => void;
  onAborted?: (session: SessionRecord) => void;
  onFailed?: (errorMessage: string, session: SessionRecord) => void;
}

export async function runBoundHostTurn<TActiveTurn>(
  options: BoundHostTurnOptions<TActiveTurn>,
  dependencies: HostTurnDependencies = {},
): Promise<SessionRecord> {
  let session = options.session;
  const controller = new AbortController();
  options.onActiveTurnStart(options.createActiveTurn(controller, session.id));
  options.markQueuedTurnStarted();

  try {
    const abortOnStart = options.shouldAbortOnStart?.() ?? false;
    const input = await options.buildInput();

    const outcome = await runHostTurn(
      {
        host: options.host,
        input,
        cwd: options.cwd,
        stateRootDir: options.stateRootDir,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        abortSignal: controller.signal,
        callbacks: options.callbacks,
        extraTools: options.extraTools,
      },
      {
        ...dependencies,
        onRunTurnStarted: () => {
          dependencies.onRunTurnStarted?.();
          if (abortOnStart) {
            queueMicrotask(() => {
              if (!controller.signal.aborted) {
                controller.abort();
              }
            });
          }
        },
      },
    );
    session = outcome.session;

    if (outcome.status === "completed") {
      options.onCompleted?.(outcome.result!, session);
      return session;
    }

    if (outcome.status === "paused") {
      if (outcome.pauseReason) {
        options.output.warn(outcome.pauseReason);
      }
      options.display.noteTerminalState?.();
      options.onPaused?.(outcome.result!, session);
      return session;
    }

    if (outcome.status === "aborted") {
      options.display.noteTerminalState?.();
      options.output.warn(outcome.errorMessage ?? "Turn interrupted. You can keep chatting.");
      options.onAborted?.(session);
      return session;
    }

    options.display.noteTerminalState?.();
    options.output.error(outcome.errorMessage ?? "The request failed.");
    options.output.info("The request failed, but the session is still alive. You can keep chatting.");
    options.onFailed?.(outcome.errorMessage ?? "The request failed.", session);
    return session;
  } finally {
    options.onActiveTurnEnd();
    await options.display.flush();
    options.display.dispose();
  }
}
