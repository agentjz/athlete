import { loadDotEnvFiles } from "./env.js";
import { ensureAppDirectories, loadConfig } from "./fileStore.js";
import {
  parseBooleanEnv,
  parseIntegerEnv,
  parsePlaywrightBrowserEnv,
  parsePlaywrightOutputModeEnv,
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
  const paths = await ensureAppDirectories();
  const fileConfig = await loadConfig();
  const projectRoots = await resolveProjectRoots(cwd);
  const playwrightEnabled = parseBooleanEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_ENABLED) ?? fileConfig.mcp.playwright.enabled;
  const telegramAllowedUserIds = process.env.DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS
    ? parseTelegramAllowedUserIds(process.env.DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS)
    : fileConfig.telegram.allowedUserIds;

  const telegramConfig = normalizeTelegramConfig({
    ...fileConfig.telegram,
    token: process.env.DEADMOUSE_TELEGRAM_TOKEN ?? fileConfig.telegram.token,
    apiBaseUrl: process.env.DEADMOUSE_TELEGRAM_API_BASE_URL ?? fileConfig.telegram.apiBaseUrl,
    proxyUrl: process.env.DEADMOUSE_TELEGRAM_PROXY_URL ?? fileConfig.telegram.proxyUrl,
    allowedUserIds: telegramAllowedUserIds,
    polling: {
      ...fileConfig.telegram.polling,
      timeoutSeconds:
        parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_POLLING_TIMEOUT_SECONDS) ?? fileConfig.telegram.polling.timeoutSeconds,
      limit: parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_POLLING_LIMIT) ?? fileConfig.telegram.polling.limit,
      retryBackoffMs:
        parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_POLLING_RETRY_BACKOFF_MS) ??
        fileConfig.telegram.polling.retryBackoffMs,
    },
    delivery: {
      ...fileConfig.telegram.delivery,
      maxRetries:
        parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_DELIVERY_MAX_RETRIES) ?? fileConfig.telegram.delivery.maxRetries,
      baseDelayMs:
        parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_DELIVERY_BASE_DELAY_MS) ??
        fileConfig.telegram.delivery.baseDelayMs,
      maxDelayMs:
        parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_DELIVERY_MAX_DELAY_MS) ?? fileConfig.telegram.delivery.maxDelayMs,
    },
    messageChunkChars:
      parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_MESSAGE_CHUNK_CHARS) ?? fileConfig.telegram.messageChunkChars,
    typingIntervalMs:
      parseIntegerEnv(process.env.DEADMOUSE_TELEGRAM_TYPING_INTERVAL_MS) ?? fileConfig.telegram.typingIntervalMs,
  });

  const merged = normalizeConfig(
    {
      ...fileConfig,
      provider: process.env.DEADMOUSE_PROVIDER ?? fileConfig.provider,
      model: process.env.DEADMOUSE_MODEL ?? overrides.model ?? fileConfig.model,
      profile: process.env.DEADMOUSE_PROFILE ?? fileConfig.profile,
      thinking: parseThinkingEnv(process.env.DEADMOUSE_THINKING) ?? fileConfig.thinking,
      reasoningEffort: parseReasoningEffortEnv(process.env.DEADMOUSE_REASONING_EFFORT) ?? fileConfig.reasoningEffort,
      baseUrl: process.env.DEADMOUSE_BASE_URL ?? fileConfig.baseUrl,
      mcp: {
        ...fileConfig.mcp,
        enabled: parseBooleanEnv(process.env.DEADMOUSE_MCP_ENABLED) ?? fileConfig.mcp.enabled,
        playwright: {
          ...fileConfig.mcp.playwright,
          enabled: playwrightEnabled,
          browser: parsePlaywrightBrowserEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER) ?? fileConfig.mcp.playwright.browser,
          headless: parseBooleanEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_HEADLESS) ?? fileConfig.mcp.playwright.headless,
          isolated: parseBooleanEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED) ?? fileConfig.mcp.playwright.isolated,
          userDataDir: process.env.DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR ?? fileConfig.mcp.playwright.userDataDir,
          outputMode:
            parsePlaywrightOutputModeEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE) ??
            fileConfig.mcp.playwright.outputMode,
          saveSession: parseBooleanEnv(process.env.DEADMOUSE_MCP_PLAYWRIGHT_SAVE_SESSION) ?? fileConfig.mcp.playwright.saveSession,
        },
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
    throw new Error("Missing agent profile. Set DEADMOUSE_PROFILE explicitly in the project's .deadmouse/.env file.");
  }
  resolveAgentProfile(merged.profile);

  return {
    ...merged,
    apiKey: process.env.DEADMOUSE_API_KEY ?? "",
    mineru: readMineruRuntimeConfig(),
    paths,
    telegram: resolveTelegramRuntimeConfig(merged.telegram, projectRoots.stateRootDir),
  };
}
