import { noteSessionDiff } from "../session/sessionDiff.js";
import { createInternalReminder } from "../session/taskState.js";
import { createMessage } from "../session/messages.js";
import { createStoredToolMessage } from "../toolResults/storage.js";
import { noteRuntimeToolExecution } from "../runtimeMetrics.js";
import { noteSubstantiveToolActivity } from "./closeout.js";
import { shouldInjectTodoReminder } from "./finalize.js";
import { getPlanBlockedResult, readCommandFromArgs } from "./planGate.js";
import { persistToolBatchCheckpoint } from "./persistence.js";
import { executeToolBatch } from "./toolBatch.js";
import { getLightweightVerificationAttempt, readVerificationProgress } from "../verification/signals.js";
import { markVerificationRequired, noteVerificationReminder, recordVerificationAttempt } from "../verification/state.js";
import { getSkillToolGateResult } from "../../skills/state.js";
import { getWorkflowToolGateResult } from "../../skills/workflowGuards.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import { throwIfAborted } from "../../utils/abort.js";
import { classifyCommand } from "../../utils/commandPolicy.js";
import type { ChangeStore } from "../../changes/store.js";
import type { ProjectContext, SessionRecord, StoredMessage, ToolExecutionResult } from "../../types.js";
import type { ToolRegistry } from "../../tools/types.js";
import type { SkillRuntimeState } from "../../skills/types.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions } from "../types.js";
import type { ToolLoopGuard } from "./loopGuard.js";
import { readToolFailureError } from "./toolFailure.js";

export interface ProcessToolCallBatchInput {
  session: SessionRecord;
  response: AssistantResponse;
  options: RunTurnOptions;
  identity: AgentIdentity;
  skillRuntimeState: SkillRuntimeState;
  toolRegistry: ToolRegistry;
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  loopGuard: ToolLoopGuard;
  changedPaths: Set<string>;
  hasSubstantiveToolActivity: boolean;
  validationAttempted: boolean;
  validationPassed: boolean;
  requiresVerification: boolean;
  validationReminderInjected: boolean;
  roundsSinceTodoWrite: number;
}

export interface ProcessToolCallBatchResult {
  session: SessionRecord;
  changedPaths: Set<string>;
  hasSubstantiveToolActivity: boolean;
  validationAttempted: boolean;
  validationPassed: boolean;
  requiresVerification: boolean;
  validationReminderInjected: boolean;
  roundsSinceTodoWrite: number;
  leadShouldYieldForDelegatedWork: boolean;
}

export async function processToolCallBatch(input: ProcessToolCallBatchInput): Promise<ProcessToolCallBatchResult> {
  let session = input.session;
  let changedPaths = new Set(input.changedPaths);
  let hasSubstantiveToolActivity = input.hasSubstantiveToolActivity;
  let validationAttempted = input.validationAttempted;
  let validationPassed = input.validationPassed;
  let requiresVerification = input.requiresVerification;
  let validationReminderInjected = input.validationReminderInjected;
  let roundsSinceTodoWrite = input.roundsSinceTodoWrite;
  let leadShouldYieldForDelegatedWork = false;
  const { response, options, identity, skillRuntimeState, toolRegistry, projectContext, changeStore, loopGuard } = input;

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
  let usedTodoWrite = false;
  const preflightBlocked = new Map<string, ToolExecutionResult>();
  for (const toolCall of response.toolCalls) {
    throwIfAborted(options.abortSignal, "Turn aborted by user.");
    options.callbacks?.onToolCall?.(toolCall.function.name, toolCall.function.arguments);
    usedTodoWrite = usedTodoWrite || toolCall.function.name === "todo_write";
    hasSubstantiveToolActivity = noteSubstantiveToolActivity(hasSubstantiveToolActivity, toolCall.function.name);
    const command = readCommandFromArgs(toolCall.function.arguments);
    if (command && (toolCall.function.name === "run_shell" || toolCall.function.name === "background_run")) {
      const classification = classifyCommand(command);
      if (!classification.isReadOnly && !classification.validationKind) {
        session = await options.sessionStore.save({
          ...session,
          verificationState: markVerificationRequired(session.verificationState),
        });
        ({ validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session));
        validationReminderInjected = false;
      }
    }
    const blockedResult = loopGuard.getPreflightBlockedResult(toolCall);
    const planBlockedResult = blockedResult
      ? null
      : getPlanBlockedResult(toolCall.function.name, toolCall.function.arguments, session, identity);
    const skillBlockedResult = blockedResult || planBlockedResult
      ? null
      : getSkillToolGateResult(toolCall.function.name, skillRuntimeState);
    const workflowBlockedResult = blockedResult || planBlockedResult || skillBlockedResult
      ? null
      : getWorkflowToolGateResult(toolCall.function.name, toolCall.function.arguments, session, skillRuntimeState);
    const gatedResult = blockedResult ?? planBlockedResult ?? skillBlockedResult ?? workflowBlockedResult ?? undefined;
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
    if (result.ok && metadata?.collaboration?.yieldLeadUntilCloseout) {
      leadShouldYieldForDelegatedWork = true;
    }
    if (metadata?.changedPaths?.length) {
      changedPaths = new Set([...changedPaths, ...metadata.changedPaths]);
      metadata.changedPaths.forEach((changedPath) => batchChangedPaths.add(changedPath));
      loopGuard.reset();
      session = await options.sessionStore.save(noteSessionDiff({
        ...session,
        verificationState: markVerificationRequired(session.verificationState, {
          pendingPaths: metadata.changedPaths,
        }),
      }, metadata.sessionDiff));
      ({ validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session));
      validationReminderInjected = false;
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

    const verificationAttempt = metadata?.verification?.attempted
      ? metadata.verification
      : getLightweightVerificationAttempt({
          toolName: toolCall.function.name,
          rawArgs: toolCall.function.arguments,
          pendingPaths: session.verificationState?.pendingPaths ?? [...changedPaths],
          resultOk: result.ok,
        });
    if (verificationAttempt) {
      session = await options.sessionStore.save({
        ...session,
        verificationState: recordVerificationAttempt(session.verificationState, verificationAttempt),
      });
      ({ validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session));
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
        verificationAttempted: verificationAttempt?.attempted ?? false,
        verificationPassed: verificationAttempt?.passed ?? false,
      },
    });
    if (result.ok) {
      options.callbacks?.onToolResult?.(toolCall.function.name, result.output);
    } else {
      options.callbacks?.onToolError?.(toolCall.function.name, result.output);
    }
    const storedToolMessage = await createStoredToolMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      rawOutput: result.output,
      sessionId: session.id,
      projectContext,
    });
    batchToolMessages.push(storedToolMessage);
    session = await options.sessionStore.appendMessages(
      noteRuntimeToolExecution(session, {
        toolName: toolCall.function.name,
        durationMs,
        ok: result.ok,
        externalizedToolResult: storedToolMessage.externalizedToolResult,
      }),
      [storedToolMessage],
    );
  }

  session = await persistToolBatchCheckpoint({
    session,
    sessionStore: options.sessionStore,
    toolNames: response.toolCalls.map((toolCall) => toolCall.function.name),
    toolMessages: batchToolMessages,
    changedPaths: [...batchChangedPaths],
  });
  roundsSinceTodoWrite = usedTodoWrite ? 0 : roundsSinceTodoWrite + 1;
  if (shouldInjectTodoReminder(roundsSinceTodoWrite, response.toolCalls)) {
    session = await options.sessionStore.appendMessages(session, [
      createMessage(
        "user",
        createInternalReminder(
          "This task is still in progress. Use todo_write now: keep the list short, mark exactly one item in_progress, and update completed items before continuing.",
        ),
      ),
    ]);
  }
  if (requiresVerification && !validationAttempted) {
    session = await options.sessionStore.save({
      ...session,
      verificationState: noteVerificationReminder(session.verificationState),
    });
  }

  return {
    session,
    changedPaths,
    hasSubstantiveToolActivity,
    validationAttempted,
    validationPassed,
    requiresVerification,
    validationReminderInjected,
    roundsSinceTodoWrite,
    leadShouldYieldForDelegatedWork,
  };
}
