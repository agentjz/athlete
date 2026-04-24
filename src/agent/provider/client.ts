import OpenAI from "openai";

import { resolveProviderCapabilities } from "../provider.js";
import { buildProviderBaseUrlCandidates } from "./connection.js";
import type { RuntimeConfig } from "../../types.js";

export interface ProviderClientCandidate {
  baseUrl: string;
  client: OpenAI;
}

export interface ProviderClientPool {
  candidates: () => ProviderClientCandidate[];
  markHealthy: (baseUrl: string) => void;
}

export function createProviderClientPool(
  config: Pick<RuntimeConfig, "apiKey" | "baseUrl" | "provider" | "model">,
): ProviderClientPool {
  const capabilities = resolveProviderCapabilities({
    provider: config.provider,
    model: config.model,
  });
  const baseUrls = buildProviderBaseUrlCandidates(config.baseUrl);
  const clients = new Map<string, OpenAI>();
  let preferredBaseUrl: string | undefined;

  return {
    candidates() {
      const ordered = preferredBaseUrl
        ? [preferredBaseUrl, ...baseUrls.filter((baseUrl) => baseUrl !== preferredBaseUrl)]
        : baseUrls;
      return ordered.map((baseUrl) => ({
        baseUrl,
        client: getOrCreateClient(baseUrl),
      }));
    },
    markHealthy(baseUrl: string) {
      preferredBaseUrl = baseUrl;
    },
  };

  function getOrCreateClient(baseUrl: string): OpenAI {
    const existing = clients.get(baseUrl);
    if (existing) {
      return existing;
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: baseUrl,
      timeout: capabilities.requestTimeoutMs,
      maxRetries: 0,
    });
    clients.set(baseUrl, client);
    return client;
  }
}

export function isProviderClientPool(value: unknown): value is ProviderClientPool {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as ProviderClientPool).candidates === "function" &&
    typeof (value as ProviderClientPool).markHealthy === "function"
  );
}
