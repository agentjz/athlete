import type { ChangeStore } from "../../changes/store.js";
import { buildOrchestratorObjective } from "../../orchestrator/metadata.js";
import { createToolRegistry } from "../../capabilities/tools/index.js";
import type { PreparedToolRegistryCall, ToolRegistry } from "../../capabilities/tools/core/types.js";
import type {
  ProjectContext,
  SessionRecord,
  ToolCallRecord,
  ToolExecutionProtocolPolicy,
  ToolExecutionResult,
} from "../../types.js";
import type { RunTurnOptions } from "../types.js";
import {
  clearPendingToolCalls,
  completePendingToolCall,
  createPendingToolCalls,
  notePendingToolCalls,
} from "./pendingToolCalls.js";
import {
  attachProtocolToToolResult,
  buildToolHookErrorResult,
  runAfterToolCallHook,
  runBeforeToolCallHook,
} from "./toolHooks.js";
import { buildToolExecutionFailureResult, executePreparedToolCallWithRecovery, executeToolCallWithRecovery } from "./toolExecutor.js";

interface BatchExecutionItem {
  toolCall: ToolCallRecord;
  result: ToolExecutionResult;
  durationMs: number;
}

interface RunnableBatchItem {
  toolCall: ToolCallRecord;
  preparedCall: PreparedToolRegistryCall;
}

export interface ExecuteToolBatchResult {
  session: SessionRecord;
  items: BatchExecutionItem[];
  policy: ToolExecutionProtocolPolicy;
}

export async function executeToolBatch(
  params: {
    session: SessionRecord;
    toolCalls: ToolCallRecord[];
    toolRegistry: ToolRegistry;
    options: RunTurnOptions;
    projectContext: ProjectContext;
    changeStore: ChangeStore;
    preflightBlock?: (toolCall: ToolCallRecord) => ToolExecutionResult | undefined;
  },
): Promise<ExecuteToolBatchResult> {
  const policy = resolveBatchExecutionPolicy(params.toolRegistry, params.toolCalls);
  if (!params.toolRegistry.prepare || !params.toolRegistry.runPrepared || !params.toolRegistry.finalize) {
    return executeFallbackToolBatch(params, policy);
  }

  const toolContext = buildToolContext(params.options, params.session, params.projectContext, params.changeStore);
  const results = new Map<string, ToolExecutionResult>();
  const durations = new Map<string, number>();
  const runnable: RunnableBatchItem[] = [];

  for (const toolCall of params.toolCalls) {
    const blocked = params.preflightBlock?.(toolCall);
    if (blocked) {
      results.set(toolCall.id, blocked);
      continue;
    }

    const preparation = await params.toolRegistry.prepare(toolCall.function.name, toolCall.function.arguments, toolContext);
    if (!preparation.ok) {
      const finalized = params.toolRegistry.finalize(preparation.preparedCall, preparation.result, {
        status: "blocked",
        blockedIn: "prepare",
      });
      results.set(toolCall.id, attachProtocolToToolResult(finalized, finalized.metadata?.protocol));
      continue;
    }

    const beforeHook = await runBeforeToolCallHook(params.options.callbacks, {
      toolCall,
      session: params.session,
    });
    if (beforeHook?.block) {
      const blocked = buildToolHookErrorResult(
        "TOOL_HOOK_BLOCKED",
        beforeHook.reason || `Tool ${toolCall.function.name} was blocked by beforeToolCall.`,
      );
      const finalized = params.toolRegistry.finalize(preparation.preparedCall, blocked, {
        status: "blocked",
        blockedIn: "prepare",
      });
      results.set(toolCall.id, attachProtocolToToolResult(finalized, finalized.metadata?.protocol));
      continue;
    }

    runnable.push({
      toolCall,
      preparedCall: preparation.preparedCall,
    });
  }

  let session = params.session;
  if (runnable.length > 0) {
    session = await params.options.sessionStore.save(
      notePendingToolCalls(session, createPendingToolCalls(runnable.map((item) => item.toolCall), policy)),
    );
  }

  if (policy === "parallel") {
    const executions = new Map(
      runnable.map((item) => [
        item.toolCall.id,
        (() => {
          const startedAt = Date.now();
          return executePreparedToolCallWithRecovery(params.toolRegistry, item.preparedCall, toolContext, item.toolCall)
            .then((result) => ({
              result,
              durationMs: Date.now() - startedAt,
            }));
        })(),
      ]),
    );

    for (const item of runnable) {
      const executed = await executions.get(item.toolCall.id);
      const finalized = await finalizeBatchItem(
        params,
        session,
        item,
        executed?.result ?? buildToolExecutionFailureResult(
          item.toolCall,
          new Error(`Missing prepared execution result for ${item.toolCall.function.name}.`),
        ),
        executed?.durationMs ?? 0,
      );
      session = finalized.session;
      results.set(item.toolCall.id, finalized.result);
      durations.set(item.toolCall.id, finalized.durationMs);
    }
  } else {
    for (const item of runnable) {
      const startedAt = Date.now();
      const executed = await executePreparedToolCallWithRecovery(params.toolRegistry, item.preparedCall, toolContext, item.toolCall);
      const finalized = await finalizeBatchItem(params, session, item, executed, Date.now() - startedAt);
      session = finalized.session;
      results.set(item.toolCall.id, finalized.result);
      durations.set(item.toolCall.id, finalized.durationMs);
    }
  }

  if (runnable.length > 0) {
    session = await params.options.sessionStore.save(clearPendingToolCalls(session));
  }

  return {
    session,
    items: params.toolCalls
      .map((toolCall) => ({
        toolCall,
        result: results.get(toolCall.id),
        durationMs: durations.get(toolCall.id) ?? 0,
      }))
      .filter((item): item is BatchExecutionItem => Boolean(item.result)),
    policy,
  };
}

async function executeFallbackToolBatch(
  params: {
    session: SessionRecord;
    toolCalls: ToolCallRecord[];
    toolRegistry: ToolRegistry;
    options: RunTurnOptions;
    projectContext: ProjectContext;
    changeStore: ChangeStore;
    preflightBlock?: (toolCall: ToolCallRecord) => ToolExecutionResult | undefined;
  },
  policy: ToolExecutionProtocolPolicy,
): Promise<ExecuteToolBatchResult> {
  const items: BatchExecutionItem[] = [];
  for (const toolCall of params.toolCalls) {
    const blocked = params.preflightBlock?.(toolCall);
    if (blocked) {
      items.push({
        toolCall,
        result: blocked,
        durationMs: 0,
      });
      continue;
    }

    const startedAt = Date.now();
    items.push({
      toolCall,
      result: await executeToolCallWithRecovery(
        params.toolRegistry as ReturnType<typeof createToolRegistry>,
        toolCall,
        params.options,
        params.session,
        params.projectContext,
        params.changeStore,
      ),
      durationMs: Date.now() - startedAt,
    });
  }

  return {
    session: params.session,
    items,
    policy,
  };
}

async function finalizeBatchItem(
  params: {
    options: RunTurnOptions;
    toolRegistry: ToolRegistry;
  },
  session: SessionRecord,
  item: RunnableBatchItem,
  executed: ToolExecutionResult,
  durationMs: number,
): Promise<{
  session: SessionRecord;
  result: ToolExecutionResult;
  durationMs: number;
}> {
  const finalizedFromExecution = params.toolRegistry.finalize?.(item.preparedCall, executed, {
    status: executed.ok ? "completed" : "failed",
    blockedIn: executed.ok ? undefined : "execute",
  }) ?? executed;

  let finalized = attachProtocolToToolResult(finalizedFromExecution, finalizedFromExecution.metadata?.protocol);
  try {
    const afterHook = await runAfterToolCallHook(params.options.callbacks, {
      toolCall: item.toolCall,
      session,
      result: finalized,
    });
    if (afterHook?.result) {
      const overridden = params.toolRegistry.finalize?.(item.preparedCall, afterHook.result, {
        status: afterHook.result.ok ? "completed" : "failed",
        blockedIn: afterHook.result.ok ? undefined : "finalize",
      }) ?? afterHook.result;
      finalized = attachProtocolToToolResult(overridden, overridden.metadata?.protocol);
    }
  } catch (error) {
    const failed = params.toolRegistry.finalize?.(
      item.preparedCall,
      buildToolHookErrorResult(
        "TOOL_HOOK_FAILED",
        error instanceof Error ? error.message : String(error),
      ),
      {
        status: "failed",
        blockedIn: "finalize",
      },
    );
    finalized = attachProtocolToToolResult(failed ?? buildToolExecutionFailureResult(item.toolCall, error), failed?.metadata?.protocol);
  }

  return {
    session: await params.options.sessionStore.save(completePendingToolCall(session, item.toolCall.id)),
    result: finalized,
    durationMs,
  };
}

function resolveBatchExecutionPolicy(
  toolRegistry: ToolRegistry,
  toolCalls: ToolCallRecord[],
): ToolExecutionProtocolPolicy {
  if (!toolRegistry.entries || toolCalls.length === 0) {
    return "sequential";
  }

  const entries = new Map(toolRegistry.entries.map((entry) => [entry.name, entry]));
  for (const toolCall of toolCalls) {
    const entry = entries.get(toolCall.function.name);
    if (!entry) {
      return "sequential";
    }

    if (entry.governance.mutation !== "read" || !entry.governance.concurrencySafe) {
      return "sequential";
    }
  }

  return "parallel";
}

function buildToolContext(
  options: RunTurnOptions,
  session: SessionRecord,
  projectContext: ProjectContext,
  changeStore: ChangeStore,
) {
  return {
    config: options.config,
    cwd: options.cwd,
    sessionId: session.id,
    identity: options.identity ?? {
      kind: "lead" as const,
      name: "lead",
    },
    callbacks: options.callbacks,
    abortSignal: options.abortSignal,
    projectContext,
    currentObjective: session.taskState?.objective
      ? buildOrchestratorObjective(session.taskState.objective)
      : undefined,
    changeStore,
    createToolRegistry,
  };
}
