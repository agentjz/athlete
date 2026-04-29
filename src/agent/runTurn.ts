import { buildRequestContext } from "./context/builder.js";
import { AgentTurnError, getErrorMessage } from "./errors.js";
import { fetchAssistantResponse } from "./api.js";
import { evaluateProviderRecoveryBudget, resolveProviderRecoveryBudget } from "./recoveryBudget.js";
import { createProviderClientPool } from "./provider/client.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, pickRequestModel, sleep } from "./retryPolicy.js";
import { noteRuntimeCompression, noteRuntimeModelRequests, type ModelRequestMetric } from "./runtimeMetrics.js";
import { injectInboxMessagesIfNeeded, loadPromptRuntimeState, shouldYieldTurn } from "./runtimeState.js";
import { buildSystemPromptLayers } from "./systemPrompt.js";
import { buildRunTurnResult, createDelegationDispatchYieldTransition, createProviderRecoveryBudgetPauseTransition, createProviderRecoveryTransition, createYieldTransition } from "./runtimeTransition.js";
import { prioritizeToolDefinitionsForTurn, prioritizeToolEntriesForTurn } from "./toolPriority.js";
import { resolveAgentProfile } from "./profiles/registry.js";
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
import { buildSkillRuntimeState } from "../capabilities/skills/state.js";
import { createRuntimeToolRegistry } from "../capabilities/tools/core/runtimeRegistry.js";
import { throwIfAborted } from "../utils/abort.js";

export type { AgentCallbacks, RunTurnOptions } from "./types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  const projectContext = await loadProjectContext(options.cwd);
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  const turnModelConfig = options.config;
  const profile = resolveAgentProfile(options.config.profile);
  if (!turnModelConfig.apiKey) {
    throw new Error("Missing API key. Open the project's .env file and add DEADMOUSE_API_KEY.");
  }
  let session = await initializeTurnSession(options.session, options.input, options.sessionStore);
  const client = createProviderClientPool(turnModelConfig);
  const ownsToolRegistry = !options.toolRegistry;
  const toolRegistry = options.toolRegistry ?? (await createRuntimeToolRegistry(options.config));
  const changeStore = new ChangeStore(options.config.paths.changesDir);
  const loopGuard = new ToolLoopGuard();
  const softToolLimit = Math.max(1, options.config.maxToolIterations);
  const continuationWindow = softToolLimit * Math.max(1, options.config.maxContinuationBatches);
  const recoveryBudget = resolveProviderRecoveryBudget(options.config);
  let compressionAnnounced = false;
  let changedPaths = new Set<string>();
  let { validationAttempted, validationPassed } = readVerificationProgress(session);
  let consecutiveRequestFailures = 0;
  let recoveryStartedAtMs: number | undefined;
  let roundsSinceTodoWrite = 0;
  try {
    for (let iteration = 0; ; iteration += 1) {
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      if (shouldYieldTurn(options.yieldAfterToolSteps, iteration)) {
        const transition = createYieldTransition(iteration, options.yieldAfterToolSteps);
        session = await persistYieldedTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.(`Yielding after ${iteration} tool steps so the managed runtime can reconcile state.`);
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
      const runtimeState = await loadPromptRuntimeState(
        projectContext.stateRootDir,
        identity,
        options.cwd,
        session.taskState?.objective,
        {
          skills: projectContext.skills,
          toolEntries: toolRegistry.entries,
          mcpConfig: options.config.mcp,
        },
      );
      const skillRuntimeState = buildSkillRuntimeState({
        skills: projectContext.skills,
        session,
      });
      let promptLayers = buildSystemPromptLayers(
        options.cwd,
        turnModelConfig,
        projectContext,
        session.taskState,
        session.todoItems,
        session.verificationState,
        runtimeState,
        skillRuntimeState,
        session.checkpoint,
        session.acceptanceState,
        profile,
      );
      promptLayers = extendPromptLayersForTurnState(promptLayers, iteration, softToolLimit, consecutiveRequestFailures);
      const requestModel = pickRequestModel(turnModelConfig.provider, turnModelConfig.model, consecutiveRequestFailures);
      const requestConfig = buildRecoveryRequestConfig(options.config, requestModel, consecutiveRequestFailures);
      const requestContext = buildRequestContext(promptLayers, session.messages, requestConfig);
      const prioritizedToolDefinitions = toolRegistry.entries
        ? prioritizeToolEntriesForTurn(toolRegistry.entries, {
            input: options.input,
            objective: session.taskState?.objective,
            taskSummary: runtimeState.taskSummary,
            activeSkillNames: [...skillRuntimeState.loadedSkillNames],
          }).map((entry) => entry.definition)
        : prioritizeToolDefinitionsForTurn(toolRegistry.definitions, {
            input: options.input,
            objective: session.taskState?.objective,
            taskSummary: runtimeState.taskSummary,
            activeSkillNames: [...skillRuntimeState.loadedSkillNames],
          });
      const turnToolDefinitions = prioritizedToolDefinitions;
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
          {
            provider: turnModelConfig.provider,
            model: requestModel,
            thinking: turnModelConfig.thinking,
            reasoningEffort: turnModelConfig.reasoningEffort,
            maxOutputTokens: turnModelConfig.maxOutputTokens,
          },
          turnToolDefinitions,
          options.callbacks,
          options.abortSignal,
          (metric) => modelRequestMetrics.push(metric),
          {
            rootDir: projectContext.stateRootDir,
            sessionId: session.id,
            identityKind: identity.kind,
            identityName: identity.name,
            configuredModel: turnModelConfig.model,
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
            const persisted = await persistRecoveryOrPauseFromCompaction({
              session,
              response,
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
            options.callbacks?.onStatus?.("Detected repeated post-compaction empty responses. Recovering with the current frame preserved...");
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
          options,
        });
        if (completed.kind === "continue") {
          session = completed.session;
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
        toolRegistry,
        projectContext,
        changeStore,
        loopGuard,
        changedPaths,
        validationAttempted,
        validationPassed,
        roundsSinceTodoWrite,
      });
      session = batchResult.session;
      changedPaths = batchResult.changedPaths;
      validationAttempted = batchResult.validationAttempted;
      validationPassed = batchResult.validationPassed;
      roundsSinceTodoWrite = batchResult.roundsSinceTodoWrite;
      if (identity.kind === "lead" && batchResult.leadShouldYieldForDelegatedWork) {
        const transition = createDelegationDispatchYieldTransition();
        session = await persistYieldedTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.("Lead yielded after delegation dispatch; machine runtime will wait for execution closeout before resuming.");
        return buildRunTurnResult({
          session,
          changedPaths,
          verificationAttempted: validationAttempted,
          verificationPassed: validationPassed,
          transition,
        });
      }
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
