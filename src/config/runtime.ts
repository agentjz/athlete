import { loadDotEnvFiles } from "./env.js";
import { ensureAppDirectories, loadConfig } from "./fileStore.js";
import {
  parseBooleanEnv,
  parseIntegerEnv,
  parsePlaywrightBrowserEnv,
  parsePlaywrightOutputModeEnv,
  readMineruRuntimeConfig,
} from "./runtimeEnv.js";
import {
  normalizeConfig,
  parseAgentMode,
} from "./schema.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import {
  parseTelegramAllowedUserIds,
  resolveTelegramRuntimeConfig,
  normalizeTelegramConfig,
} from "../telegram/config.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";
import { FileWeixinCredentialStore } from "../weixin/credentialsStore.js";
import {
  parseWeixinAllowedUserIds,
  resolveWeixinRuntimeConfig,
  normalizeWeixinConfig,
} from "../weixin/config.js";

export async function resolveRuntimeConfig(overrides: CliOverrides = {}): Promise<RuntimeConfig> {
  const cwd = overrides.cwd ?? process.cwd();
  loadDotEnvFiles(cwd);
  const paths = await ensureAppDirectories();
  const fileConfig = await loadConfig();
  const projectRoots = await resolveProjectRoots(cwd);
  const playwrightEnabled = parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_ENABLED) ?? fileConfig.mcp.playwright.enabled;
  const telegramAllowedUserIds = process.env.ATHLETE_TELEGRAM_ALLOWED_USER_IDS
    ? parseTelegramAllowedUserIds(process.env.ATHLETE_TELEGRAM_ALLOWED_USER_IDS)
    : fileConfig.telegram.allowedUserIds;
  const weixinAllowedUserIds = process.env.ATHLETE_WEIXIN_ALLOWED_USER_IDS
    ? parseWeixinAllowedUserIds(process.env.ATHLETE_WEIXIN_ALLOWED_USER_IDS)
    : fileConfig.weixin.allowedUserIds;

  const telegramConfig = normalizeTelegramConfig({
    ...fileConfig.telegram,
    token: process.env.ATHLETE_TELEGRAM_TOKEN ?? fileConfig.telegram.token,
    apiBaseUrl: process.env.ATHLETE_TELEGRAM_API_BASE_URL ?? fileConfig.telegram.apiBaseUrl,
    proxyUrl: process.env.ATHLETE_TELEGRAM_PROXY_URL ?? fileConfig.telegram.proxyUrl,
    allowedUserIds: telegramAllowedUserIds,
    polling: {
      ...fileConfig.telegram.polling,
      timeoutSeconds:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_TIMEOUT_SECONDS) ?? fileConfig.telegram.polling.timeoutSeconds,
      limit: parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_LIMIT) ?? fileConfig.telegram.polling.limit,
      retryBackoffMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_RETRY_BACKOFF_MS) ??
        fileConfig.telegram.polling.retryBackoffMs,
    },
    delivery: {
      ...fileConfig.telegram.delivery,
      maxRetries:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_MAX_RETRIES) ?? fileConfig.telegram.delivery.maxRetries,
      baseDelayMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_BASE_DELAY_MS) ??
        fileConfig.telegram.delivery.baseDelayMs,
      maxDelayMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_MAX_DELAY_MS) ?? fileConfig.telegram.delivery.maxDelayMs,
    },
    messageChunkChars:
      parseIntegerEnv(process.env.ATHLETE_TELEGRAM_MESSAGE_CHUNK_CHARS) ?? fileConfig.telegram.messageChunkChars,
    typingIntervalMs:
      parseIntegerEnv(process.env.ATHLETE_TELEGRAM_TYPING_INTERVAL_MS) ?? fileConfig.telegram.typingIntervalMs,
  });

  const weixinConfig = normalizeWeixinConfig({
    ...fileConfig.weixin,
    baseUrl: process.env.ATHLETE_WEIXIN_BASE_URL ?? fileConfig.weixin.baseUrl,
    cdnBaseUrl: process.env.ATHLETE_WEIXIN_CDN_BASE_URL ?? fileConfig.weixin.cdnBaseUrl,
    allowedUserIds: weixinAllowedUserIds,
    polling: {
      ...fileConfig.weixin.polling,
      timeoutMs:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_POLLING_TIMEOUT_MS) ?? fileConfig.weixin.polling.timeoutMs,
      retryBackoffMs:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_POLLING_RETRY_BACKOFF_MS) ??
        fileConfig.weixin.polling.retryBackoffMs,
    },
    delivery: {
      ...fileConfig.weixin.delivery,
      maxRetries:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_DELIVERY_MAX_RETRIES) ?? fileConfig.weixin.delivery.maxRetries,
      baseDelayMs:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_DELIVERY_BASE_DELAY_MS) ?? fileConfig.weixin.delivery.baseDelayMs,
      maxDelayMs:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_DELIVERY_MAX_DELAY_MS) ?? fileConfig.weixin.delivery.maxDelayMs,
      receiptTimeoutMs:
        parseIntegerEnv(process.env.ATHLETE_WEIXIN_DELIVERY_RECEIPT_TIMEOUT_MS) ??
        fileConfig.weixin.delivery.receiptTimeoutMs,
    },
    messageChunkChars:
      parseIntegerEnv(process.env.ATHLETE_WEIXIN_MESSAGE_CHUNK_CHARS) ?? fileConfig.weixin.messageChunkChars,
    typingIntervalMs:
      parseIntegerEnv(process.env.ATHLETE_WEIXIN_TYPING_INTERVAL_MS) ?? fileConfig.weixin.typingIntervalMs,
    qrTimeoutMs: parseIntegerEnv(process.env.ATHLETE_WEIXIN_QR_TIMEOUT_MS) ?? fileConfig.weixin.qrTimeoutMs,
    routeTag: process.env.ATHLETE_WEIXIN_ROUTE_TAG ?? fileConfig.weixin.routeTag,
  });

  const provisionalWeixin = resolveWeixinRuntimeConfig(weixinConfig, projectRoots.stateRootDir);
  const weixinCredentials = await new FileWeixinCredentialStore(provisionalWeixin.credentialsFile).load();
  const merged = normalizeConfig(
    {
      ...fileConfig,
      provider: process.env.ATHLETE_PROVIDER ?? fileConfig.provider,
      model: process.env.ATHLETE_MODEL ?? overrides.model ?? fileConfig.model,
      baseUrl: process.env.ATHLETE_BASE_URL ?? fileConfig.baseUrl,
      mode: parseAgentMode(process.env.ATHLETE_MODE) ?? overrides.mode ?? fileConfig.mode,
      mcp: {
        ...fileConfig.mcp,
        enabled: parseBooleanEnv(process.env.ATHLETE_MCP_ENABLED) ?? fileConfig.mcp.enabled,
        playwright: {
          ...fileConfig.mcp.playwright,
          enabled: playwrightEnabled,
          browser: parsePlaywrightBrowserEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_BROWSER) ?? fileConfig.mcp.playwright.browser,
          headless: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_HEADLESS) ?? fileConfig.mcp.playwright.headless,
          isolated: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED) ?? fileConfig.mcp.playwright.isolated,
          userDataDir: process.env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR ?? fileConfig.mcp.playwright.userDataDir,
          outputMode:
            parsePlaywrightOutputModeEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE) ??
            fileConfig.mcp.playwright.outputMode,
          saveSession: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_SAVE_SESSION) ?? fileConfig.mcp.playwright.saveSession,
        },
      },
      telegram: telegramConfig,
      weixin: weixinConfig,
    },
    {
      cwd,
      cacheDir: paths.cacheDir,
      stateRootDir: projectRoots.stateRootDir,
    },
  );

  return {
    ...merged,
    apiKey: process.env.ATHLETE_API_KEY ?? "",
    mineru: readMineruRuntimeConfig(),
    paths,
    telegram: resolveTelegramRuntimeConfig(merged.telegram, projectRoots.stateRootDir),
    weixin: resolveWeixinRuntimeConfig(merged.weixin, projectRoots.stateRootDir, weixinCredentials),
  };
}
