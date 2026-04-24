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
        message: `用户可修复错误：${endpoint} 返回 404。请检查 \`DEADMOUSE_BASE_URL\` 是否是正确的 OpenAI-compatible API 根地址。`,
        probeTimeoutMs,
      };
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: "user",
        message: "用户可修复错误：Provider 认证失败。请检查 `DEADMOUSE_API_KEY` 是否正确，或确认当前 key 对这个 base URL 有权限。",
        probeTimeoutMs,
      };
    }

    if (response.status >= 500) {
      return {
        kind: "provider",
        message: `Provider 错误：服务返回 ${response.status}。请稍后重试，或确认当前 provider 服务是否正常。`,
        probeTimeoutMs,
      };
    }

    if (!response.ok) {
      return {
        kind: "provider",
        message: `Provider 错误：服务返回 ${response.status}。这不是本地 runtime 初始化问题，请检查 provider 响应或配置。`,
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
      `用户可修复错误：\`DEADMOUSE_BASE_URL\` 不是合法 URL：${baseUrl}。请修复它后再重新运行 \`deadmouse doctor\`。`,
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
    return `环境错误：无法连接到 ${baseUrl}。请检查网络、代理设置，或确认 \`DEADMOUSE_BASE_URL\` 当前可达。`;
  }

  if (/fetch failed|network|timeout|socket hang up/i.test(detail)) {
    return `环境错误：连接 ${baseUrl} 失败。请检查网络、代理设置，或确认 provider 入口当前可达。`;
  }

  return `环境错误：连接 ${baseUrl} 失败。底层异常：${detail}`;
}
