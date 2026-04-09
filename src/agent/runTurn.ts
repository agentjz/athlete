import OpenAI from "openai";
import { buildRequestContext } from "./contextBuilder.js";
import { filterToolDefinitionsForCloseout, noteSubstantiveToolActivity } from "./closeout.js";
import { emitAssistantFinalOutput, emitAssistantReasoning, shouldInjectTodoReminder } from "./finalize.js";
import { AgentTurnError, getErrorMessage } from "./errors.js";
import { fetchAssistantResponse } from "./api.js";
import { ToolLoopGuard } from "./loopGuard.js";
import { createMessage } from "./messages.js";
import { getPlanBlockedResult, readCommandFromArgs } from "./planGate.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, pickRequestModel, sleep } from "./retryPolicy.js";
import { noteRuntimeCompression, noteRuntimeModelRequests, noteRuntimeToolExecution, type ModelRequestMetric } from "./runtimeMetrics.js";
import { injectInboxMessagesIfNeeded, loadPromptRuntimeState, shouldYieldTurn } from "./runtimeState.js";
import { buildSystemPromptLayers } from "./systemPrompt.js";
import { createInternalReminder } from "./taskState.js";
import { initializeTurnSession, persistRecoveryTurn, persistToolBatchCheckpoint, persistYieldedTurn } from "./turnPersistence.js";
import { createStoredToolMessage } from "./toolResultStorage.js";
import { prioritizeToolDefinitionsForTurn } from "./toolPriority.js";
import { hasIncompleteTodos } from "./todos.js";
import { executeToolCallWithRecovery } from "./toolExecutor.js";
import { getLightweightVerificationAttempt, readVerificationProgress } from "./verificationSignals.js";
import { isVerificationRequired, markVerificationRequired, noteVerificationReminder, recordVerificationAttempt } from "./verificationState.js";
import { resolveToollessTurn } from "./toollessTurn.js";
import { emitTurnProgressStatus, extendPromptLayersForTurnState } from "./turnState.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "./types.js";
import { ChangeStore } from "../changes/store.js";
import { loadProjectContext } from "../context/projectContext.js";
import { buildSkillRuntimeState, getSkillToolGateResult } from "../skills/state.js";
import { getWorkflowToolGateResult } from "../skills/workflowGuards.js";
import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import type { StoredMessage } from "../types.js";
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
  const availableToolNames = toolRegistry.definitions.map((tool) => tool.function.name);
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
        session = await persistYieldedTurn(session, options.sessionStore, iteration);
        options.callbacks?.onStatus?.(`Yielding after ${iteration} tool steps so background work can poll inbox and tasks.`);
        return {
          session,
          changedPaths: [...changedPaths],
          verificationAttempted: validationAttempted,
          verificationPassed: validationPassed,
          yielded: true,
          yieldReason: `tool_steps_${iteration}`,
          paused: false,
        };
      }
      session = await injectInboxMessagesIfNeeded(session, options, identity, projectContext.stateRootDir);
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
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
      let promptLayers = buildSystemPromptLayers(options.cwd, options.config, projectContext, session.taskState, session.todoItems, session.verificationState, runtimeState, skillRuntimeState, session.checkpoint);
      promptLayers = extendPromptLayersForTurnState(promptLayers, session.checkpoint, iteration, softToolLimit, consecutiveRequestFailures);
      const requestModel = pickRequestModel(options.config.model, consecutiveRequestFailures);
      const requestConfig = buildRecoveryRequestConfig(options.config, requestModel, consecutiveRequestFailures);
      const requestContext = buildRequestContext(promptLayers, session.messages, requestConfig);
      const prioritizedToolDefinitions = prioritizeToolDefinitionsForTurn(toolRegistry.definitions, { input: options.input, objective: session.taskState?.objective, taskSummary: runtimeState.taskSummary, missingRequiredSkillNames: skillRuntimeState.missingRequiredSkills.map((skill) => skill.name) });
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
        response = await fetchAssistantResponse(client, requestContext.messages, requestModel, turnToolDefinitions, options.callbacks, options.abortSignal, (metric) => modelRequestMetrics.push(metric));
        session = noteRuntimeModelRequests(session, modelRequestMetrics);
        consecutiveRequestFailures = 0;
      } catch (error) {
        session = noteRuntimeModelRequests(session, modelRequestMetrics);
        if (!isRecoverableTurnError(error)) {
          throw error;
        }
        consecutiveRequestFailures += 1;
        session = await persistRecoveryTurn(session, options.sessionStore, consecutiveRequestFailures, error);
        const delayMs = computeRecoveryDelayMs(consecutiveRequestFailures);
        options.callbacks?.onStatus?.(
          buildRecoveryStatus(
            error,
            consecutiveRequestFailures,
            delayMs,
            options.config.model,
            requestModel,
            requestConfig,
          ),
        );
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
      session = await options.sessionStore.appendMessages(session, [
        createMessage("assistant", response.content, {
          reasoningContent: response.reasoningContent,
          toolCalls: response.toolCalls,
        }),
      ]);
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
    if (ownsToolRegistry) {
      await toolRegistry.close?.().catch(() => undefined);
    }
  }
}
