import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runManagedAgentTurn } from "../agent/turn.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { enterCrashContext } from "../observability/crashRecorder.js";
import { recordObservabilityEvent } from "../observability/writer.js";
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
  const stateRootDir = options.stateRootDir ?? await readStateRootDir(options.cwd);
  const host = options.host ?? "unknown";
  const startedAt = Date.now();
  const releaseCrashContext = enterCrashContext({
    host,
    sessionId: options.session.id,
  });
  const createToolRegistry = dependencies.createToolRegistry ?? createHostToolRegistry;
  const runTurn = dependencies.runTurn ?? runManagedAgentTurn;
  let toolRegistry: Awaited<ReturnType<typeof createToolRegistry>> | null = null;

  await recordObservabilityEvent(stateRootDir, {
    event: "host.turn",
    status: "started",
    host,
    sessionId: options.session.id,
    identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
    identityName: (options.identity ?? DEFAULT_IDENTITY).name,
    details: {
      cwd: options.cwd,
    },
  });

  try {
    if (options.abortSignal?.aborted) {
      await recordHostTurnResult(stateRootDir, {
        host,
        sessionId: options.session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
      });
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
      await recordHostTurnResult(stateRootDir, {
        host,
        sessionId: options.session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
      });
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
    const status = result.paused ? "paused" : "completed";
    await recordHostTurnResult(stateRootDir, {
      host,
      sessionId: result.session.id,
      identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
      identityName: (options.identity ?? DEFAULT_IDENTITY).name,
      status,
      durationMs: Date.now() - startedAt,
      cwd: options.cwd,
      details: {
        changedPathCount: result.changedPaths.length,
        verificationAttempted: result.verificationAttempted,
        verificationPassed: result.verificationPassed,
      },
    });

    return {
      status,
      session: result.session,
      result,
      pauseReason: result.pauseReason,
    };
  } catch (error) {
    const session = error instanceof AgentTurnError ? error.session : options.session;
    if (isAbortError(error)) {
      await recordHostTurnResult(stateRootDir, {
        host,
        sessionId: session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
        error,
      });
      return {
        status: "aborted",
        session,
        error,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    await recordHostTurnResult(stateRootDir, {
      host,
      sessionId: session.id,
      identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
      identityName: (options.identity ?? DEFAULT_IDENTITY).name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      cwd: options.cwd,
      error,
    });
    return {
      status: "failed",
      session,
      error,
      errorMessage: getErrorMessage(error),
    };
  } finally {
    releaseCrashContext();
    await toolRegistry?.close?.().catch(() => undefined);
  }
}

async function recordHostTurnResult(
  rootDir: string,
  input: {
    host: string;
    sessionId: string;
    identityKind: string;
    identityName: string;
    status: "completed" | "paused" | "aborted" | "failed";
    durationMs: number;
    cwd: string;
    error?: unknown;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "host.turn",
    status: input.status,
    host: input.host,
    sessionId: input.sessionId,
    identityKind: input.identityKind,
    identityName: input.identityName,
    durationMs: input.durationMs,
    error: input.error,
    details: {
      cwd: input.cwd,
      ...(input.details ?? {}),
    },
  });
}

async function readStateRootDir(cwd: string): Promise<string> {
  try {
    return (await resolveProjectRoots(cwd)).stateRootDir;
  } catch {
    return cwd;
  }
}
