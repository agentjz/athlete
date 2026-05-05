import { noteSessionDiff } from "../session/sessionDiff.js";
import { createMessage, createToolMessage } from "../session/messages.js";
import { projectToolResultForModel } from "../toolResults/modelProjection.js";
import { persistToolBatchCheckpoint } from "./persistence.js";
import { executeToolBatch } from "./toolBatch.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import { throwIfAborted } from "../../utils/abort.js";
import type { ChangeStore } from "../changes/store.js";
import type { ProjectContext, SessionRecord, StoredMessage, ToolExecutionResult } from "../../types.js";
import type { ToolRegistry } from "../tools/core/types.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions } from "../types.js";
import type { ToolLoopGuard } from "./loopGuard.js";
import { readToolFailureError } from "./toolFailure.js";

export interface ProcessToolCallBatchInput {
  session: SessionRecord;
  response: AssistantResponse;
  options: RunTurnOptions;
  identity: AgentIdentity;
  toolRegistry: ToolRegistry;
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  loopGuard: ToolLoopGuard;
  changedPaths: Set<string>;
}

export interface ProcessToolCallBatchResult {
  session: SessionRecord;
  changedPaths: Set<string>;
}

export async function processToolCallBatch(input: ProcessToolCallBatchInput): Promise<ProcessToolCallBatchResult> {
  let session = input.session;
  let changedPaths = new Set(input.changedPaths);
  const { response, options, identity, toolRegistry, projectContext, changeStore, loopGuard } = input;

  if (response.content && !response.streamedAssistantContent) {
    options.callbacks?.onAssistantStage?.(response.content);
  }
  session = await options.sessionStore.appendMessages(session, [
    createMessage("assistant", response.content, {
      reasoningContent: response.reasoningContent,
      toolCalls: response.toolCalls,
    }),
  ]);

  const batchToolMessages: StoredMessage[] = [];
  const batchChangedPaths = new Set<string>();
  const preflightBlocked = new Map<string, ToolExecutionResult>();
  for (const toolCall of response.toolCalls) {
    throwIfAborted(options.abortSignal, "Turn aborted by user.");
    options.callbacks?.onToolCall?.(toolCall.function.name, toolCall.function.arguments);
    const blockedResult = loopGuard.getPreflightBlockedResult(toolCall);
    const gatedResult = blockedResult ?? undefined;
    if (gatedResult) {
      preflightBlocked.set(toolCall.id, gatedResult);
    }
    await recordObservabilityEvent(projectContext.stateRootDir, {
      event: "tool.execution",
      status: "started",
      sessionId: session.id,
      identityKind: identity.kind,
      identityName: identity.name,
      toolName: toolCall.function.name,
    });
  }
  const batchExecution = await executeToolBatch({
    session,
    toolCalls: response.toolCalls,
    toolRegistry,
    options,
    projectContext,
    changeStore,
    preflightBlock: (toolCall) => preflightBlocked.get(toolCall.id),
  });
  session = batchExecution.session;

  for (const item of batchExecution.items) {
    const { toolCall, durationMs } = item;
    let result = item.result;
    throwIfAborted(options.abortSignal, "Turn aborted by user.");
    let metadata = "metadata" in result ? result.metadata : undefined;
    if (metadata?.changedPaths?.length) {
      changedPaths = new Set([...changedPaths, ...metadata.changedPaths]);
      metadata.changedPaths.forEach((changedPath) => batchChangedPaths.add(changedPath));
      loopGuard.reset();
      session = await options.sessionStore.save(noteSessionDiff({
        ...session,
      }, metadata.sessionDiff));
    } else if (metadata?.sessionDiff) {
      session = await options.sessionStore.save(noteSessionDiff(session, metadata.sessionDiff));
    }

    if (!metadata?.changedPaths?.length) {
      const loopGuardBlockedResult = loopGuard.noteToolResult(toolCall, result);
      if (loopGuardBlockedResult) {
        result = loopGuardBlockedResult;
        metadata = undefined;
      }
    }

    await recordObservabilityEvent(projectContext.stateRootDir, {
      event: "tool.execution",
      status: result.ok ? "completed" : "failed",
      sessionId: session.id,
      identityKind: identity.kind,
      identityName: identity.name,
      toolName: toolCall.function.name,
      durationMs,
      error: result.ok ? undefined : readToolFailureError(result.output),
      details: {
        changedPathCount: metadata?.changedPaths?.length ?? 0,
      },
    });
    if (result.ok) {
      options.callbacks?.onToolResult?.(toolCall.function.name, result.output);
    } else {
      options.callbacks?.onToolError?.(toolCall.function.name, result.output);
    }
    const modelOutput = projectToolResultForModel({
      toolName: toolCall.function.name,
      result,
    });
    const storedToolMessage = createToolMessage(toolCall.id, modelOutput, toolCall.function.name);
    batchToolMessages.push(storedToolMessage);
    session = await options.sessionStore.appendMessages(session, [storedToolMessage]);
  }

  session = await persistToolBatchCheckpoint({
    session,
    sessionStore: options.sessionStore,
    toolNames: response.toolCalls.map((toolCall) => toolCall.function.name),
    toolMessages: batchToolMessages,
    changedPaths: [...batchChangedPaths],
  });
  return {
    session,
    changedPaths,
  };
}
