import type { McpConfig } from "../capabilities/mcp/types.js";
import type { TelegramConfig, TelegramRuntimeConfig } from "../config/hosts.js";

export type ModelThinkingMode = "enabled" | "disabled";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  configFile: string;
  sessionsDir: string;
  changesDir: string;
}

export interface AppConfig {
  schemaVersion: 1;
  provider: string;
  baseUrl: string;
  model: string;
  profile: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  maxOutputTokens?: number;
  yieldAfterToolSteps: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxToolIterations: number;
  maxContinuationBatches: number;
  providerRecoveryMaxAttempts?: number;
  providerRecoveryMaxElapsedMs?: number;
  managedTurnMaxSlices?: number;
  managedTurnMaxElapsedMs?: number;
  maxReadBytes: number;
  maxSearchResults: number;
  maxSpreadsheetPreviewRows: number;
  maxSpreadsheetPreviewColumns: number;
  commandStallTimeoutMs: number;
  commandMaxRetries: number;
  commandRetryBackoffMs: number;
  showReasoning: boolean;
  mcp: McpConfig;
  telegram: TelegramConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  mineru: MineruRuntimeConfig;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
}

export interface CliOverrides {
  cwd?: string;
  model?: string;
}

export interface MineruRuntimeConfig {
  token: string;
  baseUrl: string;
  agentBaseUrl: string;
  modelVersion: string;
  language: string;
  enableTable: boolean;
  enableFormula: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
}
