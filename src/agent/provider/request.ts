import type OpenAI from "openai";

import { withApiRetries } from "./apiRetry.js";
import type { ModelRequestMetric, ProviderUsageSnapshot } from "./metrics.js";
import { isAbortError } from "../../utils/abort.js";
import type { AssistantResponse, AgentCallbacks } from "../types.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import { normalizeAssistantResponse } from "./responseNormalization.js";
import { resolveProviderCapabilities } from "./capabilities.js";
import type { ProviderMessage, ProviderWireAdapter } from "./contract.js";
import { chatCompletionsAdapter } from "./chatCompletionsAdapter.js";
import { responsesAdapter } from "./responsesAdapter.js";
import { isProviderClientPool, type ProviderClientPool } from "./client.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ModelReasoningEffort, ModelThinkingMode } from "../../types.js";

export async function fetchAssistantResponse(
  client: OpenAI | ProviderClientPool,
  messages: ProviderMessage[],
  request: {
    provider: string;
    model: string;
    thinking?: ModelThinkingMode;
    reasoningEffort?: ModelReasoningEffort;
    maxOutputTokens?: number;
  },
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
  observability?: {
    rootDir: string;
    sessionId: string;
    identityKind?: string;
    identityName?: string;
    configuredModel: string;
  },
): Promise<AssistantResponse> {
  const capabilities = resolveProviderCapabilities(request);
  const adapter = selectProviderWireAdapter(capabilities.wireApi);

  return tryFetch(
    adapter,
    client,
    messages,
    request,
    tools,
    callbacks,
    false,
    abortSignal,
    onRequestMetric,
    observability,
  );
}

async function tryFetch(
  adapter: ProviderWireAdapter,
  client: OpenAI | ProviderClientPool,
  messages: ProviderMessage[],
  request: {
    provider: string;
    model: string;
    thinking?: ModelThinkingMode;
    reasoningEffort?: ModelReasoningEffort;
    maxOutputTokens?: number;
  },
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  forceReasoning: boolean,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
  observability?: {
    rootDir: string;
    sessionId: string;
    identityKind?: string;
    identityName?: string;
    configuredModel: string;
  },
): Promise<AssistantResponse> {
  const startedAt = Date.now();
  let latestMetric: ModelRequestMetric | undefined;
  let resolvedBaseUrl: string | undefined;
  const forwardMetric = (metric: ModelRequestMetric) => {
    latestMetric = metric;
    onRequestMetric?.(metric);
  };

  if (observability) {
    await recordObservabilityEvent(observability.rootDir, {
      event: "model.request",
      status: "started",
      sessionId: observability.sessionId,
      identityKind: observability.identityKind,
      identityName: observability.identityName,
      model: request.model,
      details: {
        provider: request.provider,
        configuredModel: observability.configuredModel,
        requestModel: request.model,
        wireApi: adapter.wireApi,
        baseUrl: resolvedBaseUrl,
      },
    });
  }

  try {
    const response = normalizeAssistantResponse(await withApiRetries(
      () => invokeWithProviderClients(client, async (providerClient, baseUrl) => {
        resolvedBaseUrl = baseUrl;
        return adapter.fetchStreaming(providerClient, {
          provider: request.provider,
          model: request.model,
          messages,
          tools,
          callbacks,
          forceReasoning,
          thinking: request.thinking,
          reasoningEffort: request.reasoningEffort,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal,
          onRequestMetric: forwardMetric,
        });
      }),
      abortSignal,
    ));

    if (observability) {
      await recordObservabilityEvent(observability.rootDir, {
        event: "model.request",
        status: "completed",
        sessionId: observability.sessionId,
        identityKind: observability.identityKind,
        identityName: observability.identityName,
        model: request.model,
        durationMs: Date.now() - startedAt,
        details: {
          provider: request.provider,
          configuredModel: observability.configuredModel,
          requestModel: request.model,
          wireApi: adapter.wireApi,
          baseUrl: resolvedBaseUrl,
          usageAvailable: hasUsageSnapshot(latestMetric?.usage),
        },
      });
    }
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    try {
      const response = normalizeAssistantResponse(await withApiRetries(
        () => invokeWithProviderClients(client, async (providerClient, baseUrl) => {
          resolvedBaseUrl = baseUrl;
          return adapter.fetchNonStreaming(providerClient, {
            provider: request.provider,
            model: request.model,
            messages,
            tools,
            callbacks,
            forceReasoning,
            thinking: request.thinking,
            reasoningEffort: request.reasoningEffort,
            maxOutputTokens: request.maxOutputTokens,
            abortSignal,
            onRequestMetric: forwardMetric,
          });
        }),
        abortSignal,
      ));

      if (observability) {
        await recordObservabilityEvent(observability.rootDir, {
          event: "model.request",
          status: "completed",
          sessionId: observability.sessionId,
          identityKind: observability.identityKind,
          identityName: observability.identityName,
          model: request.model,
          durationMs: Date.now() - startedAt,
          details: {
            provider: request.provider,
            configuredModel: observability.configuredModel,
            requestModel: request.model,
            wireApi: adapter.wireApi,
            baseUrl: resolvedBaseUrl,
            usageAvailable: hasUsageSnapshot(latestMetric?.usage),
          },
        });
      }
      return response;
    } catch (fallbackError) {
      if (!isAbortError(fallbackError) && observability) {
        await recordObservabilityEvent(observability.rootDir, {
          event: "model.request",
          status: "failed",
          sessionId: observability.sessionId,
          identityKind: observability.identityKind,
          identityName: observability.identityName,
          model: request.model,
          durationMs: Date.now() - startedAt,
          error: fallbackError,
          details: {
            provider: request.provider,
            configuredModel: observability.configuredModel,
            requestModel: request.model,
            wireApi: adapter.wireApi,
            baseUrl: resolvedBaseUrl,
            usageAvailable: hasUsageSnapshot(latestMetric?.usage),
          },
        });
      }
      throw fallbackError;
    }
  }
}

function selectProviderWireAdapter(
  wireApi: "responses" | "chat.completions",
): ProviderWireAdapter {
  if (wireApi === "responses") {
    return responsesAdapter;
  }

  return chatCompletionsAdapter;
}

function hasUsageSnapshot(usage: ProviderUsageSnapshot | undefined): boolean {
  return Boolean(
    usage &&
    (
      typeof usage.inputTokens === "number" ||
      typeof usage.outputTokens === "number" ||
      typeof usage.totalTokens === "number" ||
      typeof usage.reasoningTokens === "number"
    ),
  );
}

async function invokeWithProviderClients<T>(
  client: OpenAI | ProviderClientPool,
  operation: (client: OpenAI, baseUrl: string | undefined) => Promise<T>,
): Promise<T> {
  if (!isProviderClientPool(client)) {
    return operation(client, undefined);
  }

  let lastError: unknown;
  const candidates = client.candidates();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    try {
      const result = await operation(candidate.client, candidate.baseUrl);
      client.markHealthy(candidate.baseUrl);
      return result;
    } catch (error) {
      lastError = error;
      if (isAbortError(error)) {
        throw error;
      }

      const hasMoreCandidates = index < candidates.length - 1;
      if (!hasMoreCandidates || !canRetryWithAlternateBaseUrl(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function canRetryWithAlternateBaseUrl(error: unknown): boolean {
  const status = (error as { status?: unknown }).status;
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return status === 404 || status === 405 || message.includes("404") || message.includes("not found");
}
