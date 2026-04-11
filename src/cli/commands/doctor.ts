import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";

export function registerDoctorCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  program
    .command("doctor")
    .description("Check local setup and validate the API connection.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());

      ui.heading("Athlete doctor");
      ui.info(`config: ${runtime.paths.configFile}`);
      ui.info(`model: ${runtime.config.model}`);
      ui.info(`baseUrl: ${runtime.config.baseUrl}`);
      ui.info(`mode: ${runtime.config.mode}`);

      if (!runtime.config.apiKey.trim()) {
        throw new Error(
          "用户可修复错误：未找到 API key。请先在当前项目的 `.athlete/.env` 里设置 `ATHLETE_API_KEY`，再重新运行 `athlete doctor`。",
        );
      }

      const diagnosis = await probeProvider(runtime.config.baseUrl, runtime.config.apiKey);
      if (diagnosis.kind === "ok") {
        ui.success(`Provider reachable. models=${diagnosis.models}`);
        return;
      }

      throw new Error(diagnosis.message);
    });
}

async function probeProvider(
  baseUrl: string,
  apiKey: string,
): Promise<
  | { kind: "ok"; models: number }
  | { kind: "user" | "environment" | "provider"; message: string }
> {
  const endpoint = buildModelsEndpoint(baseUrl);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      kind: "environment",
      message: buildNetworkErrorMessage(baseUrl, error),
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      kind: "user",
      message: "用户可修复错误：Provider 认证失败。请检查 `ATHLETE_API_KEY` 是否正确，或确认当前 key 对这个 base URL 有权限。",
    };
  }

  if (response.status === 404) {
    return {
      kind: "user",
      message: `用户可修复错误：${endpoint} 返回 404。请检查 \`ATHLETE_BASE_URL\` 是否是正确的 OpenAI-compatible API 根地址。`,
    };
  }

  if (response.status >= 500) {
    return {
      kind: "provider",
      message: `Provider 错误：服务返回 ${response.status}。请稍后重试，或确认当前 provider 服务是否正常。`,
    };
  }

  if (!response.ok) {
    return {
      kind: "provider",
      message: `Provider 错误：服务返回 ${response.status}。这不是本地 runtime 初始化问题，请检查 provider 响应或配置。`,
    };
  }

  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  const models = Array.isArray(payload?.data) ? payload.data.length : 0;
  return {
    kind: "ok",
    models,
  };
}

function buildModelsEndpoint(baseUrl: string): string {
  try {
    return new URL("models", ensureTrailingSlash(baseUrl)).toString();
  } catch {
    throw new Error(
      `用户可修复错误：\`ATHLETE_BASE_URL\` 不是合法 URL：${baseUrl}。请修复它后再重新运行 \`athlete doctor\`。`,
    );
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function buildNetworkErrorMessage(baseUrl: string, error: unknown): string {
  const code = String((error as { code?: unknown }).code ?? "");
  const detail = error instanceof Error ? error.message : String(error);
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "ECONNRESET"].includes(code)) {
    return `环境错误：无法连接到 ${baseUrl}。请检查网络、代理设置，或确认 \`ATHLETE_BASE_URL\` 当前可达。`;
  }

  if (/fetch failed|network|timeout|socket hang up/i.test(detail)) {
    return `环境错误：连接 ${baseUrl} 失败。请检查网络、代理设置，或确认 provider 入口当前可达。`;
  }

  return `环境错误：连接 ${baseUrl} 失败。底层异常：${detail}`;
}
