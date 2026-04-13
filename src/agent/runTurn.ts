import OpenAI from "openai";
import { buildRequestContext } from "./context/builder.js";
import { AgentTurnError, getErrorMessage } from "./errors.js";
import { fetchAssistantResponse } from "./api.js";
import { createMessage } from "./session/messages.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, pickRequestModel, sleep } from "./retryPolicy.js";
import { noteRuntimeCompression, noteRuntimeModelRequests, noteRuntimeToolExecution, type ModelRequestMetric } from "./runtimeMetrics.js";
import { injectInboxMessagesIfNeeded, loadPromptRuntimeState, shouldYieldTurn } from "./runtimeState.js";
import { createInternalReminder } from "./session/taskState.js";
import { hasIncompleteTodos } from "./session/todos.js";
import { buildSystemPromptLayers } from "./systemPrompt.js";
import { buildRunTurnResult, createProviderRecoveryTransition, createYieldTransition } from "./runtimeTransition.js";
import { prioritizeToolDefinitionsForTurn, prioritizeToolEntriesForTurn } from "./toolPriority.js";
import { createStoredToolMessage } from "./toolResults/storage.js";
import { filterToolDefinitionsForCloseout, noteSubstantiveToolActivity } from "./turn/closeout.js";
import { emitAssistantFinalOutput, emitAssistantReasoning, shouldInjectTodoReminder } from "./turn/finalize.js";
import { refreshAcceptanceStateForTurn } from "./turn/acceptance.js";
import { ToolLoopGuard } from "./turn/loopGuard.js";
import { getPlanBlockedResult, readCommandFromArgs } from "./turn/planGate.js";
import { initializeTurnSession, persistRecoveryTurn, persistToolBatchCheckpoint, persistYieldedTurn } from "./turn/persistence.js";
import { executeToolCallWithRecovery } from "./turn/toolExecutor.js";
import { resolveToollessTurn } from "./turn/toolless.js";
import { emitTurnProgressStatus, extendPromptLayersForTurnState } from "./turn/state.js";
import { getLightweightVerificationAttempt, readVerificationProgress } from "./verification/signals.js";
import { isVerificationRequired, markVerificationRequired, noteVerificationReminder, recordVerificationAttempt } from "./verification/state.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "./types.js";
import { ChangeStore } from "../changes/store.js";
import { loadProjectContext } from "../context/projectContext.js";
import { buildSkillRuntimeState, getSkillToolGateResult } from "../skills/state.js";
import { getWorkflowToolGateResult } from "../skills/workflowGuards.js";
import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import type { StoredMessage } from "../types.js";
import { recordObservabilityEvent } from "../observability/writer.js";
import { throwIfAborted } from "../utils/abort.js";
import { classifyCommand } from "../utils/commandPolicy.js";

export type { AgentCallbacks, RunTurnOptions } from "./types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  if (!options.config.apiKey) {
    throw new Error("Missing ATHLETE_API_KEY. Open the project's .env file and add your key.");
  }
  const projectContext = await loadProjectContext(options.cwd);
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  let session = await initializeTurnSession(options.session, options.input, options.sessionStore);
  const client = new OpenAI({ apiKey: options.config.apiKey, baseURL: options.config.baseUrl });
  const ownsToolRegistry = !options.toolRegistry;
  const toolRegistry = options.toolRegistry ?? (await createRuntimeToolRegistry(options.config));
  const availableToolNames = toolRegistry.entries?.map((entry) => entry.name) ?? toolRegistry.definitions.map((tool) => tool.function.name);
  const changeStore = new ChangeStore(options.config.paths.changesDir);
  const loopGuard = new ToolLoopGuard();
  const softToolLimit = Math.max(1, options.config.maxToolIterations);
  const continuationWindow = softToolLimit * Math.max(1, options.config.maxContinuationBatches);
  const hadIncompleteTodosAtStart = options.identity?.kind === "lead" ? hasIncompleteTodos(options.session.todoItems) : false;
  let compressionAnnounced = false;
  let changedPaths = new Set<string>();
  let hasSubstantiveToolActivity = false;
  let { validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session);
  let validationReminderInjected = false;
  let consecutiveRequestFailures = 0;
  let roundsSinceTodoWrite = 0;
  try {
    for (let iteration = 0; ; iteration += 1) {
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      if (shouldYieldTurn(options.yieldAfterToolSteps, iteration)) {
        const transition = createYieldTransition(iteration, options.yieldAfterToolSteps);
        session = await persistYieldedTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.(`Yielding after ${iteration} tool steps so background work can poll inbox and tasks.`);
        return buildRunTurnResult({
          session,
          changedPaths,
          verificationAttempted: validationAttempted,
          verificationPassed: validationPassed,
          transition,
        });
      }
      session = await injectInboxMessagesIfNeeded(session, options, identity, projectContext.stateRootDir);
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      session = await refreshAcceptanceStateForTurn(session, {
        cwd: options.cwd,
        sessionStore: options.sessionStore,
      });
      const runtimeState = await loadPromptRuntimeState(projectContext.stateRootDir, identity, options.cwd);
      const skillRuntimeState = buildSkillRuntimeState({
        skills: projectContext.skills,
        session,
        input: options.input,
        identity,
        objective: session.taskState?.objective,
        taskSummary: runtimeState.taskSummary,
        availableToolNames,
      });
      let promptLayers = buildSystemPromptLayers(
        options.cwd,
        options.config,
        projectContext,
        session.taskState,
        session.todoItems,
        session.verificationState,
        runtimeState,
        skillRuntimeState,
        session.checkpoint,
        session.acceptanceState,
      );
      promptLayers = extendPromptLayersForTurnState(promptLayers, session.checkpoint, iteration, softToolLimit, consecutiveRequestFailures);
      const requestModel = pickRequestModel(options.config.provider, options.config.model, consecutiveRequestFailures);
      const requestConfig = buildRecoveryRequestConfig(options.config, requestModel, consecutiveRequestFailures);
      const requestContext = buildRequestContext(promptLayers, session.messages, requestConfig);
      const prioritizedToolDefinitions = toolRegistry.entries
        ? prioritizeToolEntriesForTurn(toolRegistry.entries, {
            input: options.input,
            objective: session.taskState?.objective,
            taskSummary: runtimeState.taskSummary,
            missingRequiredSkillNames: skillRuntimeState.missingRequiredSkills.map((skill) => skill.name),
          }).map((entry) => entry.definition)
        : prioritizeToolDefinitionsForTurn(toolRegistry.definitions, {
            input: options.input,
            objective: session.taskState?.objective,
            taskSummary: runtimeState.taskSummary,
            missingRequiredSkillNames: skillRuntimeState.missingRequiredSkills.map((skill) => skill.name),
          });
      const turnToolDefinitions = filterToolDefinitionsForCloseout(prioritizedToolDefinitions, { session, changedPaths, hasSubstantiveToolActivity, verificationState: session.verificationState });
      session = requestContext.compressed ? noteRuntimeCompression(session) : session;
      if (requestContext.compressed && !compressionAnnounced) {
        options.callbacks?.onStatus?.(`Context compressed automatically at ~${requestContext.estimatedChars} chars to keep the turn running.`);
        compressionAnnounced = true;
      }
      emitTurnProgressStatus(options.callbacks, iteration, softToolLimit, continuationWindow);
      let response;
      const modelRequestMetrics: ModelRequestMetric[] = [];
      options.callbacks?.onModelWaitStart?.();
      try {
        response = await fetchAssistantResponse(
          client,
          requestContext.messages,
          { provider: options.config.provider, model: requestModel },
          turnToolDefinitions,
          options.callbacks,
          options.abortSignal,
          (metric) => modelRequestMetrics.push(metric),
          {
            rootDir: projectContext.stateRootDir,
            sessionId: session.id,
            identityKind: identity.kind,
            identityName: identity.name,
            configuredModel: options.config.model,
          },
        );
        session = noteRuntimeModelRequests(session, modelRequestMetrics);
        consecutiveRequestFailures = 0;
      } catch (error) {
        session = noteRuntimeModelRequests(session, modelRequestMetrics);
        if (!isRecoverableTurnError(error)) {
          throw error;
        }
        consecutiveRequestFailures += 1;
        const delayMs = computeRecoveryDelayMs(consecutiveRequestFailures);
        const transition = createProviderRecoveryTransition({
          consecutiveFailures: consecutiveRequestFailures,
          error,
          configuredModel: options.config.model,
          requestModel,
          requestConfig,
          delayMs,
        });
        session = await persistRecoveryTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.(buildRecoveryStatus(transition));
        await sleep(delayMs, options.abortSignal);
        continue;
      } finally {
        options.callbacks?.onModelWaitStop?.();
      }
      emitAssistantReasoning(response, options);
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      if (response.toolCalls.length === 0) {
        const completed = await resolveToollessTurn({
          session,
          response,
          identity,
          changedPaths,
          hadIncompleteTodosAtStart,
          hasSubstantiveToolActivity,
          validationReminderInjected,
          skillRuntimeState,
          options,
        });
        if (completed.kind === "continue") {
          session = completed.session;
          validationReminderInjected = completed.validationReminderInjected;
          continue;
        }
        emitAssistantFinalOutput(response, options);
        return completed.result;
      }
      if (response.content && !response.streamedAssistantContent) {
        options.callbacks?.onAssistantStage?.(response.content);
      }
      session = await options.sessionStore.appendMessages(session, [createMessage("assistant", response.content, { reasoningContent: response.reasoningContent, toolCalls: response.toolCalls })]);
      const batchToolMessages: StoredMessage[] = [];
      const batchChangedPaths = new Set<string>();
      let usedTodoWrite = false;
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
        const blockedResult = loopGuard.getBlockedResult(toolCall);
        const planBlockedResult = blockedResult
          ? null
          : getPlanBlockedResult(toolCall.function.name, toolCall.function.arguments, session, identity);
        const skillBlockedResult = blockedResult || planBlockedResult
          ? null
          : getSkillToolGateResult(toolCall.function.name, skillRuntimeState);
        const workflowBlockedResult = blockedResult || planBlockedResult || skillBlockedResult
          ? null
          : getWorkflowToolGateResult(toolCall.function.name, toolCall.function.arguments, session, skillRuntimeState);
        const toolStartedAt = Date.now();
        await recordObservabilityEvent(projectContext.stateRootDir, {
          event: "tool.execution",
          status: "started",
          sessionId: session.id,
          identityKind: identity.kind,
          identityName: identity.name,
          toolName: toolCall.function.name,
        });
        const result = blockedResult ?? planBlockedResult ?? skillBlockedResult ?? workflowBlockedResult ?? (await executeToolCallWithRecovery(toolRegistry, toolCall, options, projectContext, changeStore));
        throwIfAborted(options.abortSignal, "Turn aborted by user.");
        const metadata = "metadata" in result ? result.metadata : undefined;
        if (metadata?.changedPaths?.length) {
          changedPaths = new Set([...changedPaths, ...metadata.changedPaths]);
          metadata.changedPaths.forEach((changedPath) => batchChangedPaths.add(changedPath));
          loopGuard.reset();
          session = await options.sessionStore.save({
            ...session,
            verificationState: markVerificationRequired(session.verificationState, {
              pendingPaths: metadata.changedPaths,
            }),
          });
          ({ validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session));
          validationReminderInjected = false;
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
          durationMs: Date.now() - toolStartedAt,
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
        session = await options.sessionStore.appendMessages(noteRuntimeToolExecution(session, { toolName: toolCall.function.name, durationMs: Date.now() - toolStartedAt, ok: result.ok, externalizedToolResult: storedToolMessage.externalizedToolResult }), [storedToolMessage]);
      }
      session = await persistToolBatchCheckpoint({ session, sessionStore: options.sessionStore, toolNames: response.toolCalls.map((toolCall) => toolCall.function.name), toolMessages: batchToolMessages, changedPaths: [...batchChangedPaths] });
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
    }
  } catch (error) {
    const persistedSession = await options.sessionStore.save(session).catch(() => session);
    throw new AgentTurnError(getErrorMessage(error), persistedSession, { cause: error });
  } finally {
    if (ownsToolRegistry) await toolRegistry.close?.().catch(() => undefined);
  }
}

function readToolFailureError(output: string): { message: string; code?: string; details?: unknown } {
  try {
    const parsed = JSON.parse(output) as {
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const message = String(parsed.error ?? output).trim() || "Tool failed.";
    const code = typeof parsed.code === "string" && parsed.code.trim().length > 0 ? parsed.code.trim() : undefined;
    return {
      message,
      code,
      details: parsed.details,
    };
  } catch {
    return {
      message: output.trim() || "Tool failed.",
    };
  }
}
