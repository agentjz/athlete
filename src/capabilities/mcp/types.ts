export type McpTransportType = "stdio" | "sse" | "streamable-http";

export interface McpRuntimeConfigContext {
  cwd?: string;
  cacheDir?: string;
  stateRootDir?: string;
}

export type McpDiscoveryStatus =
  | "disabled"
  | "not_configured"
  | "connecting"
  | "ready"
  | "not_implemented"
  | "error";

export interface McpServerAuthConfig {
  type: "none" | "token" | "oauth";
  tokenEnv: string;
  headers: Record<string, string>;
}

export interface McpServerConfig {
  name: string;
  enabled: boolean;
  transport: McpTransportType;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  url: string;
  include: string[];
  exclude: string[];
  timeoutMs: number;
  trust: boolean;
  auth: McpServerAuthConfig;
}

export interface McpConfig {
  enabled: boolean;
  servers: McpServerConfig[];
}

export interface McpConfigInput {
  enabled?: boolean;
  servers?: Array<Partial<McpServerConfig>>;
}

export interface ResolvedMcpServerDefinition extends McpServerConfig {
  id: string;
}

export interface McpInvocationContext {
  signal?: AbortSignal;
}

export interface McpToolCallResult {
  ok: boolean;
  output: string;
}

export interface McpDiscoveredTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  invoke: (input: Record<string, unknown>, context: McpInvocationContext) => Promise<McpToolCallResult>;
}

export interface McpDiscoverySnapshot {
  server: ResolvedMcpServerDefinition;
  status: McpDiscoveryStatus;
  tools: McpDiscoveredTool[];
  instructions: string[];
  diagnostics: string[];
  updatedAt: string;
}

export interface McpClient {
  readonly server: ResolvedMcpServerDefinition;
  discover(): Promise<McpDiscoverySnapshot>;
  close(): Promise<void>;
}
