import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runManagedAgentTurn } from "../agent/turn.js";
import { isAbortError } from "../utils/abort.js";
import { createHostToolRegistry } from "./toolRegistry.js";
import type { HostTurnDependencies, HostTurnOptions, HostTurnOutcome } from "./types.js";

const DEFAULT_IDENTITY = {
  kind: "lead" as const,
  name: "lead",
};

export async function runHostTurn(
  options: HostTurnOptions,
  dependencies: HostTurnDependencies = {},
): Promise<HostTurnOutcome> {
  const createToolRegistry = dependencies.createToolRegistry ?? createHostToolRegistry;
  const runTurn = dependencies.runTurn ?? runManagedAgentTurn;
  let toolRegistry: Awaited<ReturnType<typeof createToolRegistry>> | null = null;

  try {
    if (options.abortSignal?.aborted) {
      return {
        status: "aborted",
        session: options.session,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    toolRegistry = await createToolRegistry(options.config, {
      extraTools: options.extraTools,
    });

    if (options.abortSignal?.aborted) {
      return {
        status: "aborted",
        session: options.session,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    const resultPromise = runTurn({
      input: options.input,
      cwd: options.cwd,
      config: options.config,
      session: options.session,
      sessionStore: options.sessionStore,
      abortSignal: options.abortSignal,
      callbacks: options.callbacks,
      toolRegistry,
      identity: options.identity ?? DEFAULT_IDENTITY,
    });
    dependencies.onRunTurnStarted?.();
    const result = await resultPromise;

    return {
      status: result.paused ? "paused" : "completed",
      session: result.session,
      result,
      pauseReason: result.pauseReason,
    };
  } catch (error) {
    const session = error instanceof AgentTurnError ? error.session : options.session;
    if (isAbortError(error)) {
      return {
        status: "aborted",
        session,
        error,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    return {
      status: "failed",
      session,
      error,
      errorMessage: getErrorMessage(error),
    };
  } finally {
    await toolRegistry?.close?.().catch(() => undefined);
  }
}
