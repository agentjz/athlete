import { AgentTurnError, getErrorMessage } from "../errors.js";
import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import { createProviderClientPool } from "../../provider/client.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, sleep } from "../../provider/retryPolicy.js";
import {
  buildContextRuntimePromptLayers,
  buildContextRuntimeRequest,
} from "../../context/runtime/index.js";
import { createProviderRecoveryTransition } from "../runtimeTransition.js";
import { resolveAgentProfile } from "../profiles/registry.js";
import { emitAssistantFinalOutput, emitAssistantReasoning } from "./finalize.js";
import {
  initializeTurnSession,
  persistRecoveryTurn,
} from "./persistence.js";
import { processToolCallBatch } from "./toolBatchLifecycle.js";
import { resolveToollessTurn } from "./toolless.js";
import { extendPromptLayersForTurnState } from "./state.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "../types.js";
import { ChangeStore } from "../changes/store.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { createDefaultAgentToolRegistry } from "../../tools/registry.js";
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
  let changedPaths = new Set<string>();
  let consecutiveRequestFailures = 0;
  try {
    for (;;) {
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      const turnRuntimeState = {
        ...(options.runtimePromptState ?? {}),
        identity,
      };
      let promptLayers = buildContextRuntimePromptLayers({
        cwd: options.cwd,
        config: turnModelConfig,
        projectContext,
        taskState: session.taskState,
        todoItems: session.todoItems,
        runtimeState: turnRuntimeState,
        checkpoint: session.checkpoint,
        profile,
        messages: session.messages,
      });
      promptLayers = extendPromptLayersForTurnState(promptLayers, consecutiveRequestFailures);
      const requestModel = turnModelConfig.model;
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
      let response;
      options.callbacks?.onModelWaitStart?.();
      try {
        const modelRequest = {
          messages: requestContext.messages,
          request: {
            provider: turnModelConfig.provider,
            model: requestModel,
            thinking: turnModelConfig.thinking,
            reasoningEffort: turnModelConfig.reasoningEffort,
            maxOutputTokens: turnModelConfig.maxOutputTokens,
          },
          tools: turnToolDefinitions,
          callbacks: options.callbacks,
          abortSignal: options.abortSignal,
          observability: {
            rootDir: projectContext.stateRootDir,
            sessionId: session.id,
            identityKind: identity.kind,
            identityName: identity.name,
            configuredModel: turnModelConfig.model,
          },
        };
        response = options.fetchAssistantResponse
          ? await options.fetchAssistantResponse(modelRequest)
          : await fetchProviderAssistantResponse(
            client,
            modelRequest.messages,
            modelRequest.request,
            modelRequest.tools,
            modelRequest.callbacks,
            modelRequest.abortSignal,
            undefined,
            modelRequest.observability,
          );
        consecutiveRequestFailures = 0;
      } catch (error) {
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
        await (options.recoverySleep ?? sleep)(delayMs, options.abortSignal);
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
