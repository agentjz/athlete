import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { resolveRuntimeConfig } from "../../src/config/store.js";
import { createTempWorkspace } from "../helpers.js";

test("resolveRuntimeConfig takes provider truth from the project .deadmouse/.env and ignores TT-config auth sidecars", async (t) => {
  const root = await createTempWorkspace("provider-runtime-config", t);
  const nestedCwd = path.join(root, "packages", "app");
  const ttConfigDir = path.join(root, "TT-config auth");
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.mkdir(ttConfigDir, { recursive: true });

  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=openai",
      "DEADMOUSE_API_KEY=project-key",
      "DEADMOUSE_BASE_URL=https://relay.example.test/v1",
      "DEADMOUSE_MODEL=gpt-5.4",
      "DEADMOUSE_PROFILE=intp",
      "DEADMOUSE_REASONING_EFFORT=medium",
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
    "DEADMOUSE_PROVIDER",
    "DEADMOUSE_API_KEY",
    "DEADMOUSE_BASE_URL",
    "DEADMOUSE_MODEL",
    "DEADMOUSE_PROFILE",
    "DEADMOUSE_THINKING",
    "DEADMOUSE_REASONING_EFFORT",
  ]);

  try {
    restoreEnv({
      DEADMOUSE_PROVIDER: undefined,
      DEADMOUSE_API_KEY: undefined,
      DEADMOUSE_BASE_URL: undefined,
      DEADMOUSE_MODEL: undefined,
      DEADMOUSE_PROFILE: undefined,
      DEADMOUSE_THINKING: undefined,
      DEADMOUSE_REASONING_EFFORT: undefined,
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

test("resolveRuntimeConfig lets DEADMOUSE_PROFILE override the project env file", async (t) => {
  const root = await createTempWorkspace("profile-runtime-config", t);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=deepseek",
      "DEADMOUSE_API_KEY=project-key",
      "DEADMOUSE_BASE_URL=https://api.deepseek.com",
      "DEADMOUSE_MODEL=deepseek-v4-flash",
      "DEADMOUSE_PROFILE=intp",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv(["DEADMOUSE_PROFILE"]);

  try {
    restoreEnv({
      DEADMOUSE_PROFILE: "grok",
    });

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.equal(runtime.profile, "grok");
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig reads runtime budget values from the project env file", async (t) => {
  const root = await createTempWorkspace("runtime-budget-env-config", t);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=deepseek",
      "DEADMOUSE_API_KEY=project-key",
      "DEADMOUSE_BASE_URL=https://api.deepseek.com",
      "DEADMOUSE_MODEL=deepseek-v4-flash",
      "DEADMOUSE_PROFILE=intp",
      "DEADMOUSE_CONTEXT_WINDOW_MESSAGES=77",
      "DEADMOUSE_MAX_CONTEXT_CHARS=123456",
      "DEADMOUSE_CONTEXT_SUMMARY_CHARS=12345",
      "DEADMOUSE_MAX_OUTPUT_TOKENS=23456",
      "DEADMOUSE_YIELD_AFTER_TOOL_STEPS=9",
      "DEADMOUSE_MAX_TOOL_ITERATIONS=7",
      "DEADMOUSE_MAX_CONTINUATION_BATCHES=6",
      "DEADMOUSE_MANAGED_TURN_MAX_SLICES=5",
      "DEADMOUSE_MANAGED_TURN_MAX_ELAPSED_MS=234567",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv([
    "DEADMOUSE_CONTEXT_WINDOW_MESSAGES",
    "DEADMOUSE_MAX_CONTEXT_CHARS",
    "DEADMOUSE_CONTEXT_SUMMARY_CHARS",
    "DEADMOUSE_MAX_OUTPUT_TOKENS",
    "DEADMOUSE_YIELD_AFTER_TOOL_STEPS",
    "DEADMOUSE_MAX_TOOL_ITERATIONS",
    "DEADMOUSE_MAX_CONTINUATION_BATCHES",
    "DEADMOUSE_MANAGED_TURN_MAX_SLICES",
    "DEADMOUSE_MANAGED_TURN_MAX_ELAPSED_MS",
  ]);

  try {
    restoreEnv({
      DEADMOUSE_CONTEXT_WINDOW_MESSAGES: undefined,
      DEADMOUSE_MAX_CONTEXT_CHARS: undefined,
      DEADMOUSE_CONTEXT_SUMMARY_CHARS: undefined,
      DEADMOUSE_MAX_OUTPUT_TOKENS: undefined,
      DEADMOUSE_YIELD_AFTER_TOOL_STEPS: undefined,
      DEADMOUSE_MAX_TOOL_ITERATIONS: undefined,
      DEADMOUSE_MAX_CONTINUATION_BATCHES: undefined,
      DEADMOUSE_MANAGED_TURN_MAX_SLICES: undefined,
      DEADMOUSE_MANAGED_TURN_MAX_ELAPSED_MS: undefined,
    });

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.equal(runtime.contextWindowMessages, 77);
    assert.equal(runtime.maxContextChars, 123_456);
    assert.equal(runtime.contextSummaryChars, 12_345);
    assert.equal(runtime.maxOutputTokens, 23_456);
    assert.equal(runtime.yieldAfterToolSteps, 9);
    assert.equal(runtime.maxToolIterations, 7);
    assert.equal(runtime.maxContinuationBatches, 6);
    assert.equal(runtime.managedTurnMaxSlices, 5);
    assert.equal(runtime.managedTurnMaxElapsedMs, 234_567);
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig fails closed when no agent profile is explicitly configured", async (t) => {
  const root = await createTempWorkspace("missing-profile-runtime-config", t);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=deepseek",
      "DEADMOUSE_API_KEY=project-key",
      "DEADMOUSE_BASE_URL=https://api.deepseek.com",
      "DEADMOUSE_MODEL=deepseek-v4-flash",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv(["DEADMOUSE_PROFILE"]);

  try {
    restoreEnv({
      DEADMOUSE_PROFILE: undefined,
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
