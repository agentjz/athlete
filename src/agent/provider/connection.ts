import { resolveProviderCapabilities } from "../provider.js";

export interface ProviderConnectionProbeInput {
  provider?: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export type ProviderConnectionProbeResult =
  | {
      kind: "ok";
      models: number;
      resolvedBaseUrl: string;
      probeTimeoutMs: number;
    }
  | {
      kind: "user" | "environment" | "provider";
      message: string;
      probeTimeoutMs: number;
    };

export async function probeProviderConnection(
  input: ProviderConnectionProbeInput,
): Promise<ProviderConnectionProbeResult> {
  const capabilities = resolveProviderCapabilities({
    provider: input.provider,
    model: input.model,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  const probeTimeoutMs = capabilities.doctorProbeTimeoutMs;
  let lastFailure:
    | Exclude<ProviderConnectionProbeResult, { kind: "ok" }>
    | undefined;

  for (const candidateBaseUrl of buildProviderBaseUrlCandidates(input.baseUrl)) {
    const endpoint = buildModelsEndpoint(candidateBaseUrl);
    let response: Response;

    try {
      response = await fetchImpl(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
        },
        signal: AbortSignal.timeout(probeTimeoutMs),
      });
    } catch (error) {
      lastFailure = {
        kind: "environment",
        message: buildNetworkErrorMessage(input.baseUrl, error),
        probeTimeoutMs,
      };
      continue;
    }

    if (response.status === 404) {
      lastFailure = {
        kind: "user",
        message: `User-fixable error: ${endpoint} returned 404. Check whether \`DEADMOUSE_BASE_URL\` is the correct OpenAI-compatible API base URL.`,
        probeTimeoutMs,
      };
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: "user",
        message: "User-fixable error: provider authentication failed. Check `DEADMOUSE_API_KEY`, or confirm this key is authorized for the base URL.",
        probeTimeoutMs,
      };
    }

    if (response.status >= 500) {
      return {
        kind: "provider",
        message: `Provider error: service returned ${response.status}. Retry later or confirm the provider service is healthy.`,
        probeTimeoutMs,
      };
    }

    if (!response.ok) {
      return {
        kind: "provider",
        message: `Provider error: service returned ${response.status}. This is not a local runtime initialization issue; check provider response or configuration.`,
        probeTimeoutMs,
      };
    }

    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    const models = Array.isArray(payload?.data) ? payload.data.length : 0;
    return {
      kind: "ok",
      models,
      resolvedBaseUrl: candidateBaseUrl,
      probeTimeoutMs,
    };
  }

  return lastFailure ?? {
    kind: "environment",
    message: buildNetworkErrorMessage(input.baseUrl, new Error("Provider probe failed.")),
    probeTimeoutMs,
  };
}

export function buildProviderBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = trimTrailingSlash(baseUrl);
  if (!normalized) {
    return [normalized];
  }

  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === "" || parsed.pathname === "/") {
      candidates.push(trimTrailingSlash(new URL("v1", ensureTrailingSlash(parsed.toString())).toString()));
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

export function buildModelsEndpoint(baseUrl: string): string {
  try {
    return new URL("models", ensureTrailingSlash(baseUrl)).toString();
  } catch {
    throw new Error(
      `User-fixable error: \`DEADMOUSE_BASE_URL\` is not a valid URL: ${baseUrl}. Fix it and rerun \`deadmouse doctor\`.`,
    );
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function trimTrailingSlash(baseUrl: string): string {
  const trimmed = String(baseUrl ?? "").trim();
  if (!trimmed) {
    return trimmed;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function buildNetworkErrorMessage(baseUrl: string, error: unknown): string {
  const code = String((error as { code?: unknown }).code ?? "");
  const detail = error instanceof Error ? error.message : String(error);
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET"].includes(code)) {
    return `Environment error: unable to connect to ${baseUrl}. Check network, proxy settings, or whether \`DEADMOUSE_BASE_URL\` is reachable.`;
  }

  if (/fetch failed|network|timeout|socket hang up|econnrefused|enotfound|etimedout/i.test(detail)) {
    return `Environment error: connection to ${baseUrl} failed. Check network, proxy settings, or whether the provider endpoint is reachable.`;
  }

  return `Environment error: connection to ${baseUrl} failed. Cause: ${detail}`;
}
