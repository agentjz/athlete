import { AgentTurnError, getErrorMessage } from "../errors.js";
import { fetchAssistantResponse } from "../provider/index.js";
import { evaluateProviderRecoveryBudget, resolveProviderRecoveryBudget } from "../provider/recoveryBudget.js";
import { createProviderClientPool } from "../provider/client.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, pickRequestModel, sleep } from "../provider/retryPolicy.js";
import { injectInboxMessagesIfNeeded, loadPromptRuntimeState } from "./runtimeState.js";
import {
  buildContextRuntimePromptLayers,
  buildContextRuntimeRequest,
  buildContextRuntimeToolProgress,
} from "../contextRuntime/index.js";
import { buildRunTurnResult, createProviderRecoveryBudgetPauseTransition, createProviderRecoveryTransition, createYieldTransition } from "../runtimeTransition.js";
import { resolveAgentProfile } from "../profiles/registry.js";
import { emitAssistantFinalOutput, emitAssistantReasoning } from "./finalize.js";
import { ToolLoopGuard } from "./loopGuard.js";
import {
  initializeTurnSession,
  persistCheckpointTransition,
  persistRecoveryTurn,
  persistYieldedTurn,
} from "./persistence.js";
import { processToolCallBatch } from "./toolBatchLifecycle.js";
import { resolveToollessTurn } from "./toolless.js";
import { emitTurnProgressStatus, extendPromptLayersForTurnState } from "./state.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "../types.js";
import { ChangeStore } from "../changes/store.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { createDefaultAgentToolRegistry } from "../tools/registry.js";
import { throwIfAborted } from "../../utils/abort.js";

export type { AgentCallbacks, RunTurnOptions } from "../types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  const projectContext = await loadProjectContext(options.cwd);
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  const turnModelConfig = options.config;
  const profile = resolveAgentProfile(options.config.profile);
  if (!turnModelConfig.apiKey) {
    throw new Error("Missing API key. Open the project's .env file and add KITTY_API_KEY.");
  }
  let session = await initializeTurnSession(options.session, options.input, options.sessionStore);
  const client = createProviderClientPool(turnModelConfig);
  const ownsToolRegistry = !options.toolRegistry;
  const toolRegistry = options.toolRegistry ?? (await createDefaultAgentToolRegistry(options.config));
  const changeStore = new ChangeStore(options.config.paths.changesDir);
  const loopGuard = new ToolLoopGuard();
  const softToolLimit = Math.max(1, options.config.maxToolIterations);
  const continuationWindow = softToolLimit * Math.max(1, options.config.maxContinuationBatches);
  const recoveryBudget = resolveProviderRecoveryBudget(options.config);
  let changedPaths = new Set<string>();
  let consecutiveRequestFailures = 0;
  let recoveryStartedAtMs: number | undefined;
  try {
    for (let iteration = 0; ; iteration += 1) {
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      const toolProgress = buildContextRuntimeToolProgress({
        iteration,
        maxToolIterations: options.config.maxToolIterations,
        maxContinuationBatches: options.config.maxContinuationBatches,
        yieldAfterToolSteps: options.yieldAfterToolSteps,
      });
      if (toolProgress.shouldYield) {
        const transition = createYieldTransition(iteration, options.yieldAfterToolSteps);
        session = await persistYieldedTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.(`Yielding after ${iteration} tool steps so the managed runtime can reconcile state.`);
        return buildRunTurnResult({
          session,
          changedPaths,
          transition,
        });
      }
      session = await injectInboxMessagesIfNeeded(session, options, identity, projectContext.stateRootDir);
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      const runtimeState = await loadPromptRuntimeState(
        projectContext.stateRootDir,
        identity,
        options.cwd,
        session.taskState?.objective,
      );
      const turnRuntimeState = {
        ...runtimeState,
        ...(options.runtimePromptState ?? {}),
        identity,
      };
      let promptLayers = buildContextRuntimePromptLayers({
        cwd: options.cwd,
        config: turnModelConfig,
        projectContext,
        taskState: session.taskState,
        runtimeState: turnRuntimeState,
        checkpoint: session.checkpoint,
        profile,
        messages: session.messages,
      });
      promptLayers = extendPromptLayersForTurnState(promptLayers, iteration, softToolLimit, consecutiveRequestFailures);
      const requestModel = pickRequestModel(turnModelConfig.provider, turnModelConfig.model, consecutiveRequestFailures);
      const requestConfig = buildRecoveryRequestConfig(options.config, requestModel, consecutiveRequestFailures);
      const requestContext = buildContextRuntimeRequest({
        prompt: promptLayers,
        session,
        config: requestConfig,
      });
      const turnToolDefinitions = toolRegistry.definitions;
      if (requestContext.compressed) {
        options.callbacks?.onStatus?.(`Context compressed automatically at ~${requestContext.estimatedChars} chars to keep the turn running.`);
      }
      emitTurnProgressStatus(options.callbacks, iteration, softToolLimit, continuationWindow);
      let response;
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
          undefined,
          {
            rootDir: projectContext.stateRootDir,
            sessionId: session.id,
            identityKind: identity.kind,
            identityName: identity.name,
            configuredModel: turnModelConfig.model,
          },
        );
        consecutiveRequestFailures = 0;
        recoveryStartedAtMs = undefined;
      } catch (error) {
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
      });
      session = batchResult.session;
      changedPaths = batchResult.changedPaths;
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
