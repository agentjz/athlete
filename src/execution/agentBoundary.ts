import type { AgentCallbacks } from "../agent/types.js";
import type { ExecutionBoundaryProtocol } from "./types.js";

export type AgentExecutionBoundaryCode = "execution_boundary_runtime" | "execution_boundary_idle";

export interface AgentExecutionBoundaryReason {
  code: AgentExecutionBoundaryCode;
  message: string;
  returnTo: ExecutionBoundaryProtocol["returnTo"];
  onBoundary: ExecutionBoundaryProtocol["onBoundary"];
  elapsedMs: number;
  limitMs: number;
}

export type AgentExecutionBoundaryResult<T> =
  | {
      kind: "completed";
      result: T;
    }
  | {
      kind: "boundary";
      reason: AgentExecutionBoundaryReason;
    };

export async function runWithinAgentExecutionBoundary<T>(input: {
  boundary: ExecutionBoundaryProtocol;
  callbacks?: AgentCallbacks;
  run: (context: {
    abortSignal: AbortSignal;
    callbacks: AgentCallbacks;
  }) => Promise<T>;
}): Promise<AgentExecutionBoundaryResult<T>> {
  const startedAt = Date.now();
  const abortController = new AbortController();
  let settled = false;
  let boundaryReason: AgentExecutionBoundaryReason | undefined;
  let resolveBoundary: ((result: AgentExecutionBoundaryResult<T>) => void) | undefined;
  const boundaryPromise = new Promise<AgentExecutionBoundaryResult<T>>((resolve) => {
    resolveBoundary = resolve;
  });

  const triggerBoundary = (code: AgentExecutionBoundaryCode, limitMs: number): void => {
    if (settled || boundaryReason) {
      return;
    }
    boundaryReason = buildBoundaryReason({
      code,
      boundary: input.boundary,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      limitMs,
    });
    abortController.abort(boundaryReason);
    resolveBoundary?.({
      kind: "boundary",
      reason: boundaryReason,
    });
  };

  const runtimeTimer = setTimeout(
    () => triggerBoundary("execution_boundary_runtime", input.boundary.maxRuntimeMs),
    input.boundary.maxRuntimeMs,
  );
  let idleTimer = setTimeout(
    () => triggerBoundary("execution_boundary_idle", input.boundary.maxIdleMs),
    input.boundary.maxIdleMs,
  );

  const noteActivity = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => triggerBoundary("execution_boundary_idle", input.boundary.maxIdleMs),
      input.boundary.maxIdleMs,
    );
  };

  const runPromise = input.run({
    abortSignal: abortController.signal,
    callbacks: buildActivityCallbacks(input.callbacks, noteActivity),
  }).then<AgentExecutionBoundaryResult<T>>((result) => ({
    kind: "completed",
    result,
  }));

  try {
    const result = await Promise.race([runPromise, boundaryPromise]);
    settled = true;
    return boundaryReason ? { kind: "boundary", reason: boundaryReason } : result;
  } finally {
    settled = true;
    clearTimeout(runtimeTimer);
    clearTimeout(idleTimer);
  }
}

function buildBoundaryReason(input: {
  code: AgentExecutionBoundaryCode;
  boundary: ExecutionBoundaryProtocol;
  elapsedMs: number;
  limitMs: number;
}): AgentExecutionBoundaryReason {
  const label = input.code === "execution_boundary_runtime" ? "runtime" : "idle";
  return {
    code: input.code,
    message: `Agent execution reached its ${label} boundary (${input.limitMs}ms). Returning control to lead review.`,
    returnTo: input.boundary.returnTo,
    onBoundary: input.boundary.onBoundary,
    elapsedMs: input.elapsedMs,
    limitMs: input.limitMs,
  };
}

function buildActivityCallbacks(callbacks: AgentCallbacks | undefined, noteActivity: () => void): AgentCallbacks {
  return {
    ...callbacks,
    onModelWaitStart: () => {
      noteActivity();
      callbacks?.onModelWaitStart?.();
    },
    onModelWaitStop: () => {
      noteActivity();
      callbacks?.onModelWaitStop?.();
    },
    onStatus: (text) => {
      noteActivity();
      callbacks?.onStatus?.(text);
    },
    onAssistantStage: (text) => {
      noteActivity();
      callbacks?.onAssistantStage?.(text);
    },
    onAssistantDelta: (delta) => {
      noteActivity();
      callbacks?.onAssistantDelta?.(delta);
    },
    onAssistantDone: (fullText) => {
      noteActivity();
      callbacks?.onAssistantDone?.(fullText);
    },
    onAssistantText: (text) => {
      noteActivity();
      callbacks?.onAssistantText?.(text);
    },
    onReasoningDelta: (delta) => {
      noteActivity();
      callbacks?.onReasoningDelta?.(delta);
    },
    onReasoning: (text) => {
      noteActivity();
      callbacks?.onReasoning?.(text);
    },
    onToolCall: (name, args) => {
      noteActivity();
      callbacks?.onToolCall?.(name, args);
    },
    onToolResult: (name, output) => {
      noteActivity();
      callbacks?.onToolResult?.(name, output);
    },
    onToolError: (name, error) => {
      noteActivity();
      callbacks?.onToolError?.(name, error);
    },
    beforeToolCall: async (context) => {
      noteActivity();
      return callbacks?.beforeToolCall?.(context);
    },
    afterToolCall: async (context) => {
      noteActivity();
      return callbacks?.afterToolCall?.(context);
    },
  };
}
