import { KITTY_ENV } from "./envKeys.js";
import { INITIAL_TELEGRAM_CONFIG } from "./hosts.js";
import { INITIAL_PROJECT_DOC_MAX_BYTES } from "./projectDocs.js";
import { getInitialRuntimeConfig } from "./initialConfig.js";
import { getDefaultProviderPreset, PROVIDER_PRESETS } from "./providerPresets.js";

export function buildProjectEnvTemplate(example: boolean): string {
  const initialConfig = getInitialRuntimeConfig();
  const providerKey = example ? "replace-with-your-provider-key" : "";
  const defaultPreset = getDefaultProviderPreset();

  if (!example) {
    return [
      "# Kitty environment",
      "# Local credentials, provider presets, Telegram, and runtime configuration for this project.",
      "",
      ...formatCommonEnvSections({ initialConfig, defaultPreset, providerKey, example }),
    ].join("\n");
  }

  return [
    "# Kitty environment",
    "# Copy to .kitty/.env, then fill real credentials and choose one active provider preset.",
    "",
    ...formatCommonEnvSections({ initialConfig, defaultPreset, providerKey, example }),
  ].join("\n");
}

function formatCommonEnvSections(input: {
  initialConfig: ReturnType<typeof getInitialRuntimeConfig>;
  defaultPreset: ReturnType<typeof getDefaultProviderPreset>;
  providerKey: string;
  example: boolean;
}): string[] {
  const inactiveProviderKey = input.example ? "replace-with-your-provider-key" : "";
  const activeTelegramToken = input.example ? "replace-with-your-telegram-bot-token" : "";
  const activeTelegramAllowedUsers = input.example ? "replace-with-your-telegram-user-id" : "";
  return [
    "# Agent profile",
    `${KITTY_ENV.profile}=${input.initialConfig.profile}`,
    "",
    "# Active provider",
    ...formatProviderPreset(input.defaultPreset, {
      apiKey: input.providerKey,
      commented: false,
    }),
    "",
    "# Alternative provider presets",
    ...PROVIDER_PRESETS
      .filter((preset) => preset !== input.defaultPreset)
      .flatMap((preset) => [
        ...formatProviderPreset(preset, {
          apiKey: inactiveProviderKey,
          commented: true,
        }),
        "",
      ]),
    "# Telegram private chat",
    `${KITTY_ENV.telegramToken}=${activeTelegramToken}`,
    `${KITTY_ENV.telegramAllowedUserIds}=${activeTelegramAllowedUsers}`,
    `${KITTY_ENV.telegramApiBaseUrl}=${INITIAL_TELEGRAM_CONFIG.apiBaseUrl}`,
    `${KITTY_ENV.telegramProxyUrl}=${INITIAL_TELEGRAM_CONFIG.proxyUrl}`,
    `${KITTY_ENV.telegramPollingTimeoutSeconds}=${INITIAL_TELEGRAM_CONFIG.polling.timeoutSeconds}`,
    `${KITTY_ENV.telegramPollingLimit}=${INITIAL_TELEGRAM_CONFIG.polling.limit}`,
    `${KITTY_ENV.telegramPollingRetryBackoffMs}=${INITIAL_TELEGRAM_CONFIG.polling.retryBackoffMs}`,
    `${KITTY_ENV.telegramMessageChunkChars}=${INITIAL_TELEGRAM_CONFIG.messageChunkChars}`,
    `${KITTY_ENV.telegramTypingIntervalMs}=${INITIAL_TELEGRAM_CONFIG.typingIntervalMs}`,
    `${KITTY_ENV.telegramDeliveryMaxRetries}=${INITIAL_TELEGRAM_CONFIG.delivery.maxRetries}`,
    `${KITTY_ENV.telegramDeliveryBaseDelayMs}=${INITIAL_TELEGRAM_CONFIG.delivery.baseDelayMs}`,
    `${KITTY_ENV.telegramDeliveryMaxDelayMs}=${INITIAL_TELEGRAM_CONFIG.delivery.maxDelayMs}`,
    "",
    "# Extension switches",
    `${KITTY_ENV.extensionTodo}=${String(input.initialConfig.extensions.todo)}`,
    `${KITTY_ENV.extensionWorktree}=${String(input.initialConfig.extensions.worktree)}`,
    `${KITTY_ENV.extensionNetwork}=${String(input.initialConfig.extensions.network)}`,
    `${KITTY_ENV.extensionSpec}=${String(input.initialConfig.extensions.spec)}`,
    "",
    "# Runtime configuration",
    `${KITTY_ENV.maxOutputTokens}=${input.initialConfig.maxOutputTokens}`,
    `${KITTY_ENV.contextWindowMessages}=${input.initialConfig.contextWindowMessages}`,
    `${KITTY_ENV.maxContextChars}=${input.initialConfig.maxContextChars}`,
    `${KITTY_ENV.contextSummaryChars}=${input.initialConfig.contextSummaryChars}`,
    `${KITTY_ENV.maxReadBytes}=${input.initialConfig.maxReadBytes}`,
    `${KITTY_ENV.projectDocMaxBytes}=${INITIAL_PROJECT_DOC_MAX_BYTES}`,
    `${KITTY_ENV.commandStallTimeoutMs}=${input.initialConfig.commandStallTimeoutMs}`,
    `${KITTY_ENV.showReasoning}=${String(input.initialConfig.showReasoning)}`,
    "",
  ];
}

function formatProviderPreset(
  preset: {
    label: string;
    provider: string;
    baseUrl: string;
    model: string;
    thinking?: string;
    reasoningEffort?: string;
  },
  options: {
    apiKey: string;
    commented: boolean;
  },
): string[] {
  const prefix = options.commented ? "# " : "";
  return [
    `# Provider preset: ${preset.label}`,
    `${prefix}${KITTY_ENV.provider}=${preset.provider}`,
    `${prefix}${KITTY_ENV.apiKey}=${options.apiKey}`,
    `${prefix}${KITTY_ENV.baseUrl}=${preset.baseUrl}`,
    `${prefix}${KITTY_ENV.model}=${preset.model}`,
    `${prefix}${KITTY_ENV.thinking}=${preset.thinking ?? ""}`,
    `${prefix}${KITTY_ENV.reasoningEffort}=${preset.reasoningEffort ?? ""}`,
  ];
}
