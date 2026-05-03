import { loadDotEnvFiles } from "./env.js";
import { ensureAppDirectories, loadConfig } from "./fileStore.js";
import {
  parseBooleanEnv,
  parseIntegerEnv,
  parseReasoningEffortEnv,
  parseThinkingEnv,
  readMineruRuntimeConfig,
} from "./runtimeEnv.js";
import { normalizeConfig } from "./schema.js";
import { resolveAgentProfile } from "../agent/profiles/registry.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import {
  parseTelegramAllowedUserIds,
  resolveTelegramRuntimeConfig,
  normalizeTelegramConfig,
} from "../telegram/config.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";

export async function resolveRuntimeConfig(overrides: CliOverrides = {}): Promise<RuntimeConfig> {
  const cwd = overrides.cwd ?? process.cwd();
  loadDotEnvFiles(cwd);
  const paths = await ensureAppDirectories(cwd);
  const fileConfig = await loadConfig(cwd);
  const projectRoots = await resolveProjectRoots(cwd);
  const telegramAllowedUserIds = process.env.KITTY_TELEGRAM_ALLOWED_USER_IDS
    ? parseTelegramAllowedUserIds(process.env.KITTY_TELEGRAM_ALLOWED_USER_IDS)
    : fileConfig.telegram.allowedUserIds;

  const telegramConfig = normalizeTelegramConfig({
    ...fileConfig.telegram,
    token: process.env.KITTY_TELEGRAM_TOKEN ?? fileConfig.telegram.token,
    apiBaseUrl: process.env.KITTY_TELEGRAM_API_BASE_URL ?? fileConfig.telegram.apiBaseUrl,
    proxyUrl: process.env.KITTY_TELEGRAM_PROXY_URL ?? fileConfig.telegram.proxyUrl,
    allowedUserIds: telegramAllowedUserIds,
    polling: {
      ...fileConfig.telegram.polling,
      timeoutSeconds:
        parseIntegerEnv(process.env.KITTY_TELEGRAM_POLLING_TIMEOUT_SECONDS) ?? fileConfig.telegram.polling.timeoutSeconds,
      limit: parseIntegerEnv(process.env.KITTY_TELEGRAM_POLLING_LIMIT) ?? fileConfig.telegram.polling.limit,
      retryBackoffMs:
        parseIntegerEnv(process.env.KITTY_TELEGRAM_POLLING_RETRY_BACKOFF_MS) ??
        fileConfig.telegram.polling.retryBackoffMs,
    },
    delivery: {
      ...fileConfig.telegram.delivery,
      maxRetries:
        parseIntegerEnv(process.env.KITTY_TELEGRAM_DELIVERY_MAX_RETRIES) ?? fileConfig.telegram.delivery.maxRetries,
      baseDelayMs:
        parseIntegerEnv(process.env.KITTY_TELEGRAM_DELIVERY_BASE_DELAY_MS) ??
        fileConfig.telegram.delivery.baseDelayMs,
      maxDelayMs:
        parseIntegerEnv(process.env.KITTY_TELEGRAM_DELIVERY_MAX_DELAY_MS) ?? fileConfig.telegram.delivery.maxDelayMs,
    },
    messageChunkChars:
      parseIntegerEnv(process.env.KITTY_TELEGRAM_MESSAGE_CHUNK_CHARS) ?? fileConfig.telegram.messageChunkChars,
    typingIntervalMs:
      parseIntegerEnv(process.env.KITTY_TELEGRAM_TYPING_INTERVAL_MS) ?? fileConfig.telegram.typingIntervalMs,
  });

  const merged = normalizeConfig(
    {
      ...fileConfig,
      provider: process.env.KITTY_PROVIDER ?? fileConfig.provider,
      model: process.env.KITTY_MODEL ?? overrides.model ?? fileConfig.model,
      profile: process.env.KITTY_PROFILE ?? fileConfig.profile,
      thinking: parseThinkingEnv(process.env.KITTY_THINKING) ?? fileConfig.thinking,
      reasoningEffort: parseReasoningEffortEnv(process.env.KITTY_REASONING_EFFORT) ?? fileConfig.reasoningEffort,
      maxOutputTokens:
        parseIntegerEnv(process.env.KITTY_MAX_OUTPUT_TOKENS) ?? fileConfig.maxOutputTokens,
      baseUrl: process.env.KITTY_BASE_URL ?? fileConfig.baseUrl,
      yieldAfterToolSteps:
        parseIntegerEnv(process.env.KITTY_YIELD_AFTER_TOOL_STEPS) ?? fileConfig.yieldAfterToolSteps,
      contextWindowMessages:
        parseIntegerEnv(process.env.KITTY_CONTEXT_WINDOW_MESSAGES) ?? fileConfig.contextWindowMessages,
      maxContextChars:
        parseIntegerEnv(process.env.KITTY_MAX_CONTEXT_CHARS) ?? fileConfig.maxContextChars,
      contextSummaryChars:
        parseIntegerEnv(process.env.KITTY_CONTEXT_SUMMARY_CHARS) ?? fileConfig.contextSummaryChars,
      maxToolIterations:
        parseIntegerEnv(process.env.KITTY_MAX_TOOL_ITERATIONS) ?? fileConfig.maxToolIterations,
      maxContinuationBatches:
        parseIntegerEnv(process.env.KITTY_MAX_CONTINUATION_BATCHES) ?? fileConfig.maxContinuationBatches,
      providerRecoveryMaxAttempts:
        parseIntegerEnv(process.env.KITTY_PROVIDER_RECOVERY_MAX_ATTEMPTS) ?? fileConfig.providerRecoveryMaxAttempts,
      providerRecoveryMaxElapsedMs:
        parseIntegerEnv(process.env.KITTY_PROVIDER_RECOVERY_MAX_ELAPSED_MS) ?? fileConfig.providerRecoveryMaxElapsedMs,
      managedTurnMaxSlices:
        parseIntegerEnv(process.env.KITTY_MANAGED_TURN_MAX_SLICES) ?? fileConfig.managedTurnMaxSlices,
      managedTurnMaxElapsedMs:
        parseIntegerEnv(process.env.KITTY_MANAGED_TURN_MAX_ELAPSED_MS) ?? fileConfig.managedTurnMaxElapsedMs,
      maxReadBytes:
        parseIntegerEnv(process.env.KITTY_MAX_READ_BYTES) ?? fileConfig.maxReadBytes,
      maxSearchResults:
        parseIntegerEnv(process.env.KITTY_MAX_SEARCH_RESULTS) ?? fileConfig.maxSearchResults,
      maxSpreadsheetPreviewRows:
        parseIntegerEnv(process.env.KITTY_MAX_SPREADSHEET_PREVIEW_ROWS) ?? fileConfig.maxSpreadsheetPreviewRows,
      maxSpreadsheetPreviewColumns:
        parseIntegerEnv(process.env.KITTY_MAX_SPREADSHEET_PREVIEW_COLUMNS) ?? fileConfig.maxSpreadsheetPreviewColumns,
      commandStallTimeoutMs:
        parseIntegerEnv(process.env.KITTY_COMMAND_STALL_TIMEOUT_MS) ?? fileConfig.commandStallTimeoutMs,
      commandMaxRetries:
        parseIntegerEnv(process.env.KITTY_COMMAND_MAX_RETRIES) ?? fileConfig.commandMaxRetries,
      commandRetryBackoffMs:
        parseIntegerEnv(process.env.KITTY_COMMAND_RETRY_BACKOFF_MS) ?? fileConfig.commandRetryBackoffMs,
      showReasoning:
        parseBooleanEnv(process.env.KITTY_SHOW_REASONING) ?? fileConfig.showReasoning,
      mcp: {
        ...fileConfig.mcp,
        enabled: parseBooleanEnv(process.env.KITTY_MCP_ENABLED) ?? fileConfig.mcp.enabled,
      },
      telegram: telegramConfig,
    },
    {
      cwd,
      cacheDir: paths.cacheDir,
      stateRootDir: projectRoots.stateRootDir,
    },
  );

  if (!merged.profile) {
    throw new Error("Missing agent profile. Set KITTY_PROFILE explicitly in the project's .kitty/.env file.");
  }
  resolveAgentProfile(merged.profile);

  return {
    ...merged,
    apiKey: process.env.KITTY_API_KEY ?? "",
    mineru: readMineruRuntimeConfig(),
    paths,
    telegram: resolveTelegramRuntimeConfig(merged.telegram, projectRoots.stateRootDir),
  };
}
