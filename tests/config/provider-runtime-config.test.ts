import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { resolveRuntimeConfig } from "../../src/config/store.js";
import { ensureAppDirectories } from "../../src/config/fileStore.js";
import { createTempWorkspace } from "../helpers.js";

test("resolveRuntimeConfig takes provider truth from the project .kitty/.env and ignores TT-config auth sidecars", async (t) => {
  const root = await createTempWorkspace("provider-runtime-config", t);
  const nestedCwd = path.join(root, "packages", "app");
  const ttConfigDir = path.join(root, "TT-config auth");
  await fs.mkdir(path.join(root, ".kitty"), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.mkdir(ttConfigDir, { recursive: true });

  await fs.writeFile(
    path.join(root, ".kitty", ".env"),
    [
      "KITTY_PROVIDER=openai",
      "KITTY_API_KEY=project-key",
      "KITTY_BASE_URL=https://relay.example.test/v1",
      "KITTY_MODEL=gpt-5.4",
      "KITTY_PROFILE=intp",
      "KITTY_REASONING_EFFORT=medium",
    ].join("\n"),
    "utf8",
  );

  await fs.writeFile(
    path.join(ttConfigDir, "config.toml"),
    [
      "model_provider = \"OpenAI\"",
      "model = \"deepseek-v4-flash\"",
      "[model_providers.OpenAI]",
      "base_url = \"https://tt-config.example.test\"",
      "wire_api = \"chat.completions\"",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(ttConfigDir, "auth.json"),
    JSON.stringify({
      OPENAI_API_KEY: "tt-config-key",
    }),
    "utf8",
  );

  const previous = snapshotEnv([
    "KITTY_PROVIDER",
    "KITTY_API_KEY",
    "KITTY_BASE_URL",
    "KITTY_MODEL",
    "KITTY_PROFILE",
    "KITTY_THINKING",
    "KITTY_REASONING_EFFORT",
  ]);

  try {
    restoreEnv({
      KITTY_PROVIDER: undefined,
      KITTY_API_KEY: undefined,
      KITTY_BASE_URL: undefined,
      KITTY_MODEL: undefined,
      KITTY_PROFILE: undefined,
      KITTY_THINKING: undefined,
      KITTY_REASONING_EFFORT: undefined,
    });

    const runtime = await resolveRuntimeConfig({ cwd: nestedCwd });
    assert.equal(runtime.provider, "openai");
    assert.equal(runtime.apiKey, "project-key");
    assert.equal(runtime.baseUrl, "https://relay.example.test/v1");
    assert.equal(runtime.model, "gpt-5.4");
    assert.equal(runtime.profile, "intp");
    assert.equal(runtime.thinking, undefined);
    assert.equal(runtime.reasoningEffort, "medium");
  } finally {
    restoreEnv(previous);
  }
});

test("ensureAppDirectories keeps kitty runtime state out of local git status", async (t) => {
  const root = await createTempWorkspace("kitty-runtime-git-exclude", t);
  await execGit(root, ["init", "--quiet"]);
  await execGit(root, ["config", "user.name", "Kitty Test"]);
  await execGit(root, ["config", "user.email", "kitty-test@example.com"]);
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  await execGit(root, ["add", "."]);
  await execGit(root, ["commit", "--quiet", "-m", "init"]);

  await ensureAppDirectories(root);

  const exclude = await fs.readFile(path.join(root, ".git", "info", "exclude"), "utf8");
  const status = await execGit(root, ["status", "--short"]);

  assert.match(exclude, /^\/\.kitty\/$/m);
  assert.equal(status.trim(), "");
});

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { execa } = await import("execa");
  const result = await execa("git", args, {
    cwd,
    windowsHide: true,
  });
  return result.stdout;
}

test("resolveRuntimeConfig lets KITTY_PROFILE override the project env file", async (t) => {
  const root = await createTempWorkspace("profile-runtime-config", t);
  await fs.mkdir(path.join(root, ".kitty"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".kitty", ".env"),
    [
      "KITTY_PROVIDER=deepseek",
      "KITTY_API_KEY=project-key",
      "KITTY_BASE_URL=https://api.deepseek.com",
      "KITTY_MODEL=deepseek-v4-flash",
      "KITTY_PROFILE=intp",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv(["KITTY_PROFILE"]);

  try {
    restoreEnv({
      KITTY_PROFILE: "grok",
    });

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.equal(runtime.profile, "grok");
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig reads runtime budget values from the project env file", async (t) => {
  const root = await createTempWorkspace("runtime-budget-env-config", t);
  await fs.mkdir(path.join(root, ".kitty"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".kitty", ".env"),
    [
      "KITTY_PROVIDER=deepseek",
      "KITTY_API_KEY=project-key",
      "KITTY_BASE_URL=https://api.deepseek.com",
      "KITTY_MODEL=deepseek-v4-flash",
      "KITTY_PROFILE=intp",
      "KITTY_CONTEXT_WINDOW_MESSAGES=77",
      "KITTY_MAX_CONTEXT_CHARS=123456",
      "KITTY_CONTEXT_SUMMARY_CHARS=12345",
      "KITTY_MAX_OUTPUT_TOKENS=23456",
      "KITTY_YIELD_AFTER_TOOL_STEPS=9",
      "KITTY_MAX_TOOL_ITERATIONS=7",
      "KITTY_MAX_CONTINUATION_BATCHES=6",
      "KITTY_PROVIDER_RECOVERY_MAX_ATTEMPTS=4",
      "KITTY_PROVIDER_RECOVERY_MAX_ELAPSED_MS=345678",
      "KITTY_MANAGED_TURN_MAX_SLICES=5",
      "KITTY_MANAGED_TURN_MAX_ELAPSED_MS=234567",
      "KITTY_MAX_READ_BYTES=222222",
      "KITTY_MAX_SEARCH_RESULTS=123",
      "KITTY_MAX_SPREADSHEET_PREVIEW_ROWS=33",
      "KITTY_MAX_SPREADSHEET_PREVIEW_COLUMNS=22",
      "KITTY_COMMAND_STALL_TIMEOUT_MS=45678",
      "KITTY_COMMAND_MAX_RETRIES=2",
      "KITTY_COMMAND_RETRY_BACKOFF_MS=2345",
      "KITTY_SHOW_REASONING=false",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv([
    "KITTY_CONTEXT_WINDOW_MESSAGES",
    "KITTY_MAX_CONTEXT_CHARS",
    "KITTY_CONTEXT_SUMMARY_CHARS",
    "KITTY_MAX_OUTPUT_TOKENS",
    "KITTY_YIELD_AFTER_TOOL_STEPS",
    "KITTY_MAX_TOOL_ITERATIONS",
    "KITTY_MAX_CONTINUATION_BATCHES",
    "KITTY_PROVIDER_RECOVERY_MAX_ATTEMPTS",
    "KITTY_PROVIDER_RECOVERY_MAX_ELAPSED_MS",
    "KITTY_MANAGED_TURN_MAX_SLICES",
    "KITTY_MANAGED_TURN_MAX_ELAPSED_MS",
    "KITTY_MAX_READ_BYTES",
    "KITTY_MAX_SEARCH_RESULTS",
    "KITTY_MAX_SPREADSHEET_PREVIEW_ROWS",
    "KITTY_MAX_SPREADSHEET_PREVIEW_COLUMNS",
    "KITTY_COMMAND_STALL_TIMEOUT_MS",
    "KITTY_COMMAND_MAX_RETRIES",
    "KITTY_COMMAND_RETRY_BACKOFF_MS",
    "KITTY_SHOW_REASONING",
  ]);

  try {
    restoreEnv({
      KITTY_CONTEXT_WINDOW_MESSAGES: undefined,
      KITTY_MAX_CONTEXT_CHARS: undefined,
      KITTY_CONTEXT_SUMMARY_CHARS: undefined,
      KITTY_MAX_OUTPUT_TOKENS: undefined,
      KITTY_YIELD_AFTER_TOOL_STEPS: undefined,
      KITTY_MAX_TOOL_ITERATIONS: undefined,
      KITTY_MAX_CONTINUATION_BATCHES: undefined,
      KITTY_PROVIDER_RECOVERY_MAX_ATTEMPTS: undefined,
      KITTY_PROVIDER_RECOVERY_MAX_ELAPSED_MS: undefined,
      KITTY_MANAGED_TURN_MAX_SLICES: undefined,
      KITTY_MANAGED_TURN_MAX_ELAPSED_MS: undefined,
      KITTY_MAX_READ_BYTES: undefined,
      KITTY_MAX_SEARCH_RESULTS: undefined,
      KITTY_MAX_SPREADSHEET_PREVIEW_ROWS: undefined,
      KITTY_MAX_SPREADSHEET_PREVIEW_COLUMNS: undefined,
      KITTY_COMMAND_STALL_TIMEOUT_MS: undefined,
      KITTY_COMMAND_MAX_RETRIES: undefined,
      KITTY_COMMAND_RETRY_BACKOFF_MS: undefined,
      KITTY_SHOW_REASONING: undefined,
    });

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.equal(runtime.contextWindowMessages, 77);
    assert.equal(runtime.maxContextChars, 123_456);
    assert.equal(runtime.contextSummaryChars, 12_345);
    assert.equal(runtime.maxOutputTokens, 23_456);
    assert.equal(runtime.yieldAfterToolSteps, 9);
    assert.equal(runtime.maxToolIterations, 7);
    assert.equal(runtime.maxContinuationBatches, 6);
    assert.equal(runtime.providerRecoveryMaxAttempts, 4);
    assert.equal(runtime.providerRecoveryMaxElapsedMs, 345_678);
    assert.equal(runtime.managedTurnMaxSlices, 5);
    assert.equal(runtime.managedTurnMaxElapsedMs, 234_567);
    assert.equal(runtime.maxReadBytes, 222_222);
    assert.equal(runtime.maxSearchResults, 123);
    assert.equal(runtime.maxSpreadsheetPreviewRows, 33);
    assert.equal(runtime.maxSpreadsheetPreviewColumns, 22);
    assert.equal(runtime.commandStallTimeoutMs, 45_678);
    assert.equal(runtime.commandMaxRetries, 2);
    assert.equal(runtime.commandRetryBackoffMs, 2_345);
    assert.equal(runtime.showReasoning, false);
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig fails closed when no agent profile is explicitly configured", async (t) => {
  const root = await createTempWorkspace("missing-profile-runtime-config", t);
  await fs.mkdir(path.join(root, ".kitty"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".kitty", ".env"),
    [
      "KITTY_PROVIDER=deepseek",
      "KITTY_API_KEY=project-key",
      "KITTY_BASE_URL=https://api.deepseek.com",
      "KITTY_MODEL=deepseek-v4-flash",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv(["KITTY_PROFILE"]);

  try {
    restoreEnv({
      KITTY_PROFILE: undefined,
    });

    await assert.rejects(
      () => resolveRuntimeConfig({ cwd: root }),
      /Missing agent profile/i,
    );
  } finally {
    restoreEnv(previous);
  }
});

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}
