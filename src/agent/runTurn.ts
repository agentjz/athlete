import { buildRequestContext } from "./context/builder.js";
import { AgentTurnError, getErrorMessage } from "./errors.js";
import { fetchAssistantResponse } from "./api.js";
import { evaluateProviderRecoveryBudget, resolveProviderRecoveryBudget } from "./recoveryBudget.js";
import { createProviderClientPool } from "./provider/client.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, pickRequestModel, sleep } from "./retryPolicy.js";
import { noteRuntimeCompression, noteRuntimeModelRequests, type ModelRequestMetric } from "./runtimeMetrics.js";
import { injectInboxMessagesIfNeeded, loadPromptRuntimeState, shouldYieldTurn } from "./runtimeState.js";
import { hasIncompleteTodos } from "./session/todos.js";
import { buildSystemPromptLayers } from "./systemPrompt.js";
import { buildRunTurnResult, createProviderRecoveryBudgetPauseTransition, createProviderRecoveryTransition, createYieldTransition } from "./runtimeTransition.js";
import { prioritizeToolDefinitionsForTurn, prioritizeToolEntriesForTurn } from "./toolPriority.js";
import { filterToolDefinitionsForCloseout } from "./turn/closeout.js";
import { clearCompactionRecovery, noteCompactionObserved, notePostCompactionNoText } from "./turn/compactionRecovery.js";
import { persistRecoveryOrPauseFromCompaction } from "./turn/compactionPersistence.js";
import { emitAssistantFinalOutput, emitAssistantReasoning } from "./turn/finalize.js";
import { refreshAcceptanceStateForTurn } from "./turn/acceptance.js";
import { ToolLoopGuard } from "./turn/loopGuard.js";
import {
  initializeTurnSession,
  persistCheckpointTransition,
  persistRecoveryTurn,
  persistYieldedTurn,
} from "./turn/persistence.js";
import { processToolCallBatch } from "./turn/toolBatchLifecycle.js";
import { resolveToollessTurn } from "./turn/toolless.js";
import { emitTurnProgressStatus, extendPromptLayersForTurnState } from "./turn/state.js";
import { readVerificationProgress } from "./verification/signals.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "./types.js";
import { ChangeStore } from "../changes/store.js";
import { loadProjectContext } from "../context/projectContext.js";
import { buildSkillRuntimeState } from "../skills/state.js";
import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import { throwIfAborted } from "../utils/abort.js";

export type { AgentCallbacks, RunTurnOptions } from "./types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  if (!options.config.apiKey) {
    throw new Error("Missing DEADMOUSE_API_KEY. Open the project's .env file and add your key.");
  }
  const projectContext = await loadProjectContext(options.cwd);
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  let session = await initializeTurnSession(options.session, options.input, options.sessionStore);
  const client = createProviderClientPool(options.config);
  const ownsToolRegistry = !options.toolRegistry;
  const toolRegistry = options.toolRegistry ?? (await createRuntimeToolRegistry(options.config));
  const availableToolNames = toolRegistry.entries?.map((entry) => entry.name) ?? toolRegistry.definitions.map((tool) => tool.function.name);
  const changeStore = new ChangeStore(options.config.paths.changesDir);
  const loopGuard = new ToolLoopGuard();
  const softToolLimit = Math.max(1, options.config.maxToolIterations);
  const continuationWindow = softToolLimit * Math.max(1, options.config.maxContinuationBatches);
  const recoveryBudget = resolveProviderRecoveryBudget(options.config);
  const hadIncompleteTodosAtStart = options.identity?.kind === "lead" ? hasIncompleteTodos(options.session.todoItems) : false;
  let compressionAnnounced = false;
  let changedPaths = new Set<string>();
  let hasSubstantiveToolActivity = false;
  let { validationAttempted, validationPassed, requiresVerification } = readVerificationProgress(session);
  let validationReminderInjected = false;
  let consecutiveRequestFailures = 0;
  let recoveryStartedAtMs: number | undefined;
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
      session = requestContext.compressed
        ? noteCompactionObserved(noteRuntimeCompression(session))
        : session;
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
          { provider: options.config.provider, model: requestModel, reasoningEffort: options.config.reasoningEffort },
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
        recoveryStartedAtMs = undefined;
      } catch (error) {
        session = noteRuntimeModelRequests(session, modelRequestMetrics);
        if (!isRecoverableTurnError(error)) {
          throw error;
        }
        consecutiveRequestFailures += 1;
        recoveryStartedAtMs = recoveryStartedAtMs ?? Date.now();
        const budgetDecision = evaluateProviderRecoveryBudget({
          budget: recoveryBudget,
          attemptsUsed: consecutiveRequestFailures,
          recoveryStartedAtMs,
          lastError: error,
        });
        if (budgetDecision.exhausted) {
          const transition = createProviderRecoveryBudgetPauseTransition(budgetDecision.snapshot);
          session = await persistCheckpointTransition(session, options.sessionStore, transition);
          options.callbacks?.onStatus?.(transition.reason.pauseReason);
          return buildRunTurnResult({
            session,
            changedPaths,
            verificationAttempted: validationAttempted,
            verificationPassed: validationPassed,
            transition,
          });
        }
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
        if (!response.content?.trim()) {
          const degradation = notePostCompactionNoText(session);
          session = degradation.session;
          if (degradation.transition) {
            const recoveryReminder = degradation.transition.action === "recover"
              ? "Post-compaction degradation was detected. Resume from the latest checkpoint, restate the next step, and continue without restarting completed work."
              : "Post-compaction degradation exhausted recovery attempts. Pause here and resume later from the latest checkpoint instead of restarting from scratch.";
            const persisted = await persistRecoveryOrPauseFromCompaction({
              session,
              response,
              reminder: recoveryReminder,
              options,
              transition: degradation.transition,
            });

            if (degradation.transition.action === "pause") {
              return buildRunTurnResult({
                session: persisted,
                changedPaths,
                verificationAttempted: validationAttempted,
                verificationPassed: validationPassed,
                transition: degradation.transition,
              });
            }

            session = persisted;
            options.callbacks?.onStatus?.("Detected repeated post-compaction empty responses. Recovering from the checkpoint instead of restarting...");
            continue;
          }
        } else {
          session = clearCompactionRecovery(session);
        }

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
      session = clearCompactionRecovery(session);
      const batchResult = await processToolCallBatch({
        session,
        response,
        options,
        identity,
        skillRuntimeState,
        toolRegistry,
        projectContext,
        changeStore,
        loopGuard,
        changedPaths,
        hasSubstantiveToolActivity,
        validationAttempted,
        validationPassed,
        requiresVerification,
        validationReminderInjected,
        roundsSinceTodoWrite,
      });
      session = batchResult.session;
      changedPaths = batchResult.changedPaths;
      hasSubstantiveToolActivity = batchResult.hasSubstantiveToolActivity;
      validationAttempted = batchResult.validationAttempted;
      validationPassed = batchResult.validationPassed;
      requiresVerification = batchResult.requiresVerification;
      validationReminderInjected = batchResult.validationReminderInjected;
      roundsSinceTodoWrite = batchResult.roundsSinceTodoWrite;
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    const settledSession = session.checkpoint
      ? {
          ...session,
          checkpoint: {
            ...session.checkpoint,
            flow: {
              ...session.checkpoint.flow,
              runState: {
                status: "idle" as const,
                source: "checkpoint" as const,
                pendingToolCallCount: 0,
                updatedAt: timestamp,
              },
              pendingToolCalls: undefined,
              updatedAt: timestamp,
            },
            updatedAt: timestamp,
          },
        }
      : session;
    const persistedSession = await options.sessionStore.save(settledSession).catch(() => settledSession);
    throw new AgentTurnError(getErrorMessage(error), persistedSession, { cause: error });
  } finally {
    if (ownsToolRegistry) await toolRegistry.close?.().catch(() => undefined);
  }
}
