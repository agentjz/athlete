import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { KITTY_ENV } from "../../src/config/envKeys.js";
import { getInitialRuntimeConfig } from "../../src/config/initialConfig.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "../../src/project/statePaths.js";
import { getDefaultProviderPreset, PROVIDER_PRESETS } from "../../src/config/providerPresets.js";
import { buildProjectEnvTemplate } from "../../src/config/projectEnvTemplate.js";

test("local project env template writes one active provider and keeps provider presets visible", () => {
  const initialConfig = getInitialRuntimeConfig();
  const defaultPreset = getDefaultProviderPreset();
  const template = buildProjectEnvTemplate(false);
  const local = readEnvAssignments(template);

  assert.deepEqual([...local.keys()].sort(), expectedActiveEnvKeys());
  assert.equal(local.get(KITTY_ENV.apiKey), "");
  assert.equal(local.get(KITTY_ENV.profile), initialConfig.profile);
  assert.equal(local.get(KITTY_ENV.provider), defaultPreset.provider);
  assert.equal(local.get(KITTY_ENV.baseUrl), defaultPreset.baseUrl);
  assert.equal(local.get(KITTY_ENV.model), defaultPreset.model);
  assert.equal(local.get(KITTY_ENV.thinking), defaultPreset.thinking);
  assert.equal(local.get(KITTY_ENV.reasoningEffort), defaultPreset.reasoningEffort);
  assertProviderPresets(template);
  assertCommonOptionalEntries(template);
});

test("project env example documents provider presets and optional env entry points", () => {
  const example = buildProjectEnvTemplate(true);
  const assignments = readEnvAssignments(example);

  assert.equal(assignments.get(KITTY_ENV.apiKey), "replace-with-your-provider-key");
  assert.equal(assignments.get(KITTY_ENV.telegramToken), "replace-with-your-telegram-bot-token");
  assert.equal(assignments.get(KITTY_ENV.telegramAllowedUserIds), "replace-with-your-telegram-user-id");
  assert.deepEqual([...assignments.keys()].sort(), expectedActiveEnvKeys());
  assertProviderPresets(example);
  assertCommonOptionalEntries(example);
});

test("provider presets are rendered from the preset registry", () => {
  assertProviderPresets(buildProjectEnvTemplate(true));
});

test("project env example is generated from the current template", () => {
  const projectRoot = process.cwd();
  const exampleEnv = fs.readFileSync(
    path.join(projectRoot, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME),
    "utf8",
  ).replace(/\r\n/g, "\n");

  assert.equal(exampleEnv.trimEnd(), buildProjectEnvTemplate(true).trimEnd());
});

test("local project env may contain real secrets while keeping the current contract", () => {
  const projectRoot = process.cwd();
  const envPath = path.join(projectRoot, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const localEnv = fs.readFileSync(envPath, "utf8").replace(/\r\n/g, "\n");
  const assignments = readEnvAssignments(localEnv);

  assert.deepEqual([...assignments.keys()].sort(), expectedActiveEnvKeys());
  assertProviderPresets(localEnv);
  assertActiveProviderMatchesKnownPreset(assignments);
});

function readEnvAssignments(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (match) {
      entries.set(match[1]!, match[2]!);
    }
  }
  return entries;
}

function readMentionedEnvKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/u)) {
    const match = /^\s*#?\s*(KITTY_[A-Z0-9_]*)=/u.exec(line);
    if (match) {
      keys.add(match[1]!);
    }
  }
  return [...keys].sort();
}

function assertMentioned(content: string, keys: readonly string[]): void {
  const mentioned = readMentionedEnvKeys(content);
  for (const key of keys) {
    assert.equal(mentioned.includes(key), true, `${key} should be mentioned`);
  }
}

function assertProviderPresets(content: string): void {
  for (const preset of PROVIDER_PRESETS) {
    assert.match(content, new RegExp(escapeRegExp(`Provider preset: ${preset.label}`), "u"));
    assert.match(content, new RegExp(escapeRegExp(`${KITTY_ENV.baseUrl}=${preset.baseUrl}`), "u"));
  }
}

function assertCommonOptionalEntries(content: string): void {
  assertMentioned(content, [
    KITTY_ENV.telegramToken,
    KITTY_ENV.telegramAllowedUserIds,
    KITTY_ENV.telegramApiBaseUrl,
    KITTY_ENV.telegramProxyUrl,
    KITTY_ENV.telegramPollingTimeoutSeconds,
    KITTY_ENV.telegramPollingLimit,
    KITTY_ENV.telegramPollingRetryBackoffMs,
    KITTY_ENV.telegramMessageChunkChars,
    KITTY_ENV.telegramTypingIntervalMs,
    KITTY_ENV.telegramDeliveryMaxRetries,
    KITTY_ENV.telegramDeliveryBaseDelayMs,
    KITTY_ENV.telegramDeliveryMaxDelayMs,
    KITTY_ENV.extensionTodo,
    KITTY_ENV.extensionWorktree,
    KITTY_ENV.extensionNetwork,
    KITTY_ENV.extensionSpec,
    KITTY_ENV.maxOutputTokens,
    KITTY_ENV.contextWindowMessages,
    KITTY_ENV.maxContextChars,
    KITTY_ENV.contextSummaryChars,
    KITTY_ENV.maxReadBytes,
    KITTY_ENV.projectDocMaxBytes,
    KITTY_ENV.commandStallTimeoutMs,
    KITTY_ENV.showReasoning,
  ]);
}

function assertActiveProviderMatchesKnownPreset(assignments: Map<string, string>): void {
  const matching = PROVIDER_PRESETS.some((preset) => (
    assignments.get(KITTY_ENV.provider) === preset.provider &&
    assignments.get(KITTY_ENV.baseUrl) === preset.baseUrl &&
    assignments.get(KITTY_ENV.model) === preset.model &&
    assignments.get(KITTY_ENV.thinking) === preset.thinking &&
    assignments.get(KITTY_ENV.reasoningEffort) === preset.reasoningEffort
  ));
  assert.equal(matching, true, "active provider block should match a known provider preset");
}

function expectedActiveEnvKeys(): string[] {
  return [
    KITTY_ENV.apiKey,
    KITTY_ENV.provider,
    KITTY_ENV.baseUrl,
    KITTY_ENV.model,
    KITTY_ENV.profile,
    KITTY_ENV.thinking,
    KITTY_ENV.reasoningEffort,
    KITTY_ENV.telegramToken,
    KITTY_ENV.telegramAllowedUserIds,
    KITTY_ENV.telegramApiBaseUrl,
    KITTY_ENV.telegramProxyUrl,
    KITTY_ENV.telegramPollingTimeoutSeconds,
    KITTY_ENV.telegramPollingLimit,
    KITTY_ENV.telegramPollingRetryBackoffMs,
    KITTY_ENV.telegramMessageChunkChars,
    KITTY_ENV.telegramTypingIntervalMs,
    KITTY_ENV.telegramDeliveryMaxRetries,
    KITTY_ENV.telegramDeliveryBaseDelayMs,
    KITTY_ENV.telegramDeliveryMaxDelayMs,
    KITTY_ENV.extensionTodo,
    KITTY_ENV.extensionWorktree,
    KITTY_ENV.extensionNetwork,
    KITTY_ENV.extensionSpec,
    KITTY_ENV.maxOutputTokens,
    KITTY_ENV.contextWindowMessages,
    KITTY_ENV.maxContextChars,
    KITTY_ENV.contextSummaryChars,
    KITTY_ENV.maxReadBytes,
    KITTY_ENV.projectDocMaxBytes,
    KITTY_ENV.commandStallTimeoutMs,
    KITTY_ENV.showReasoning,
  ].sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
