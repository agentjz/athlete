import { buildPlaywrightMcpServer, getDefaultPlaywrightMcpConfig, normalizePlaywrightMcpConfig } from "./playwright/config.js";
import type {
  McpConfig,
  McpConfigInput,
  McpRuntimeConfigContext,
  McpServerAuthConfig,
  McpServerConfig,
  McpTransportType,
  ResolvedMcpServerDefinition,
} from "./types.js";

const DEFAULT_MCP_SERVER_TIMEOUT_MS = 30_000;

export function getDefaultMcpConfig(): McpConfig {
  return {
    enabled: false,
    servers: [],
    playwright: getDefaultPlaywrightMcpConfig(),
  };
}

export function normalizeMcpConfig(
  config: McpConfigInput | undefined,
  runtime: McpRuntimeConfigContext = {},
): McpConfig {
  const servers = Array.isArray(config?.servers)
    ? config!.servers
        .map((server) => normalizeMcpServer(server))
        .filter((server): server is McpServerConfig => server !== null)
    : [];
  const playwright = normalizePlaywrightMcpConfig(config?.playwright, runtime);
  const playwrightServer = buildPlaywrightMcpServer(playwright);

  return {
    enabled: Boolean(config?.enabled || playwright.enabled),
    servers: dedupeServersByName(playwrightServer ? [...servers, playwrightServer] : servers),
    playwright,
  };
}

export function resolveMcpServerDefinitions(config: McpConfig): ResolvedMcpServerDefinition[] {
  return config.servers.map((server) => ({
    ...server,
    id: server.name,
  }));
}

function normalizeMcpServer(server: Partial<McpServerConfig> | undefined): McpServerConfig | null {
  const name = String(server?.name ?? "").trim();
  if (!name) {
    return null;
  }

  return {
    name,
    enabled: server?.enabled !== false,
    transport: normalizeTransport(server?.transport),
    command: String(server?.command ?? "").trim(),
    args: normalizeStringArray(server?.args),
    env: normalizeStringMap(server?.env),
    cwd: String(server?.cwd ?? "").trim(),
    url: String(server?.url ?? "").trim(),
    include: normalizeStringArray(server?.include),
    exclude: normalizeStringArray(server?.exclude),
    timeoutMs: clampNumber(server?.timeoutMs, 1_000, 10 * 60 * 1_000, DEFAULT_MCP_SERVER_TIMEOUT_MS),
    trust: Boolean(server?.trust),
    auth: normalizeAuth(server?.auth),
  };
}

function normalizeTransport(value: string | undefined): McpTransportType {
  switch ((value ?? "").trim().toLowerCase()) {
    case "sse":
      return "sse";
    case "streamable-http":
    case "streamable_http":
    case "http":
      return "streamable-http";
    default:
      return "stdio";
  }
}

function normalizeAuth(value: Partial<McpServerAuthConfig> | undefined): McpServerAuthConfig {
  const type = normalizeAuthType(value?.type);
  return {
    type,
    tokenEnv: String(value?.tokenEnv ?? "").trim(),
    headers: normalizeStringMap(value?.headers),
  };
}

function normalizeAuthType(value: string | undefined): McpServerAuthConfig["type"] {
  switch ((value ?? "").trim().toLowerCase()) {
    case "token":
      return "token";
    case "oauth":
      return "oauth";
    default:
      return "none";
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [key.trim(), String(raw ?? "").trim()] as const)
    .filter(([key, raw]) => key.length > 0 && raw.length > 0);

  return Object.fromEntries(entries);
}

function dedupeServersByName(servers: McpServerConfig[]): McpServerConfig[] {
  const seen = new Set<string>();
  const deduped: McpServerConfig[] = [];

  for (const server of servers) {
    const key = server.name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(server);
  }

  return deduped;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
