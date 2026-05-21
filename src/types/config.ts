import type { TelegramConfig, TelegramRuntimeConfig } from "../config/hosts.js";
import type { ExtensionToggleConfig } from "../config/extensions.js";

export type ModelThinkingMode = "enabled" | "disabled";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
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
  maxOutputTokens: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxReadBytes: number;
  projectDocMaxBytes: number;
  commandStallTimeoutMs: number;
  showReasoning: boolean;
  telegram: TelegramConfig;
  extensions: ExtensionToggleConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
}

export interface CliOverrides {
  cwd?: string;
  model?: string;
}

