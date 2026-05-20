import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildProjectEnvTemplate } from "../../src/config/projectEnvTemplate.js";

const DEFAULT_ENV_KEYS = [
  "KITTY_API_KEY",
  "KITTY_BASE_URL",
  "KITTY_COMMAND_STALL_TIMEOUT_MS",
  "KITTY_CONTEXT_SUMMARY_CHARS",
  "KITTY_CONTEXT_WINDOW_MESSAGES",
  "KITTY_MAX_CONTEXT_CHARS",
  "KITTY_MAX_OUTPUT_TOKENS",
  "KITTY_MAX_READ_BYTES",
  "KITTY_MODEL",
  "KITTY_PROFILE",
  "KITTY_PROJECT_DOC_MAX_BYTES",
  "KITTY_PROVIDER",
  "KITTY_REASONING_EFFORT",
  "KITTY_SHOW_REASONING",
  "KITTY_TELEGRAM_ALLOWED_USER_IDS",
  "KITTY_TELEGRAM_API_BASE_URL",
  "KITTY_TELEGRAM_DELIVERY_BASE_DELAY_MS",
  "KITTY_TELEGRAM_DELIVERY_MAX_DELAY_MS",
  "KITTY_TELEGRAM_DELIVERY_MAX_RETRIES",
  "KITTY_TELEGRAM_MESSAGE_CHUNK_CHARS",
  "KITTY_TELEGRAM_POLLING_LIMIT",
  "KITTY_TELEGRAM_POLLING_RETRY_BACKOFF_MS",
  "KITTY_TELEGRAM_POLLING_TIMEOUT_SECONDS",
  "KITTY_TELEGRAM_PROXY_URL",
  "KITTY_TELEGRAM_TOKEN",
  "KITTY_TELEGRAM_TYPING_INTERVAL_MS",
  "KITTY_THINKING",
] as const;

test("project env templates expose the runtime environment contract", () => {
  const local = readEnvAssignments(buildProjectEnvTemplate(false));
  const example = readEnvAssignments(buildProjectEnvTemplate(true));

  assert.deepEqual([...local.keys()].sort(), [...DEFAULT_ENV_KEYS].sort());
  assert.deepEqual([...example.keys()].sort(), [...DEFAULT_ENV_KEYS].sort());
  assert.deepEqual(readMentionedEnvKeys(buildProjectEnvTemplate(false)), [...DEFAULT_ENV_KEYS].sort());
  assert.deepEqual(readMentionedEnvKeys(buildProjectEnvTemplate(true)), [...DEFAULT_ENV_KEYS].sort());
  assert.equal(example.get("KITTY_API_KEY"), "replace-with-your-provider-key");
  assert.equal(example.get("KITTY_TELEGRAM_TOKEN"), "replace-with-your-telegram-bot-token");
  assert.equal(local.get("KITTY_API_KEY"), "");
  assert.equal(local.get("KITTY_TELEGRAM_TOKEN"), "");
  assert.equal(local.get("KITTY_CONTEXT_WINDOW_MESSAGES"), "120");
  assert.equal(local.get("KITTY_MAX_CONTEXT_CHARS"), "900000");
  assert.equal(local.get("KITTY_CONTEXT_SUMMARY_CHARS"), "120000");
  assert.equal(local.get("KITTY_MAX_OUTPUT_TOKENS"), "384000");
  assert.equal(local.get("KITTY_PROJECT_DOC_MAX_BYTES"), "24576");
  assert.equal(local.get("KITTY_PROFILE"), "intp");
  assert.equal(local.get("KITTY_PROVIDER"), "deepseek");
  assert.equal(local.get("KITTY_BASE_URL"), "https://api.deepseek.com");
  assert.equal(local.get("KITTY_MODEL"), "deepseek-v4-flash");
  assert.equal(local.get("KITTY_THINKING"), "enabled");
  assert.equal(local.get("KITTY_REASONING_EFFORT"), "max");
  assertProviderPresets(buildProjectEnvTemplate(false));
  assertProviderPresets(buildProjectEnvTemplate(true));
});

test("project env example is generated from the current template", () => {
  const projectRoot = process.cwd();
  const exampleEnv = fs.readFileSync(path.join(projectRoot, ".kitty", ".env.example"), "utf8").replace(/\r\n/g, "\n");

  assert.equal(exampleEnv.trimEnd(), buildProjectEnvTemplate(true).trimEnd());
});

test("local project env may contain real secrets while keeping the current contract", () => {
  const projectRoot = process.cwd();
  const envPath = path.join(projectRoot, ".kitty", ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const localEnv = fs.readFileSync(envPath, "utf8").replace(/\r\n/g, "\n");
  const assignments = readEnvAssignments(localEnv);

  assert.deepEqual([...assignments.keys()].sort(), [...DEFAULT_ENV_KEYS].sort());
  assertProviderPresets(localEnv);
  assert.equal(assignments.get("KITTY_PROVIDER"), "deepseek");
  assert.equal(assignments.get("KITTY_BASE_URL"), "https://api.deepseek.com");
  assert.equal(assignments.get("KITTY_MODEL"), "deepseek-v4-flash");
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

function assertProviderPresets(content: string): void {
  assert.match(content, /Provider preset: YLS Codex \+ GPT-5\.4/u);
  assert.match(content, /KITTY_BASE_URL=https:\/\/code\.ylsagi\.com\/codex/u);
  assert.match(content, /Provider preset: TTAPI \+ GPT-5\.4/u);
  assert.match(content, /KITTY_BASE_URL=https:\/\/w\.ciykj\.cn/u);
  assert.match(content, /Provider preset: DeepSeek official V4/u);
  assert.match(content, /KITTY_BASE_URL=https:\/\/api\.deepseek\.com/u);
}
