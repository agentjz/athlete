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
    "DEADMOUSE_THINKING",
    "DEADMOUSE_REASONING_EFFORT",
  ]);

  try {
    restoreEnv({
      DEADMOUSE_PROVIDER: undefined,
      DEADMOUSE_API_KEY: undefined,
      DEADMOUSE_BASE_URL: undefined,
      DEADMOUSE_MODEL: undefined,
      DEADMOUSE_THINKING: undefined,
      DEADMOUSE_REASONING_EFFORT: undefined,
    });

    const runtime = await resolveRuntimeConfig({ cwd: nestedCwd });
    assert.equal(runtime.provider, "openai");
    assert.equal(runtime.apiKey, "project-key");
    assert.equal(runtime.baseUrl, "https://relay.example.test/v1");
    assert.equal(runtime.model, "gpt-5.4");
    assert.equal(runtime.thinking, undefined);
    assert.equal(runtime.reasoningEffort, "medium");
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig builds role-specific model provider profiles from project .env", async (t) => {
  const root = await createTempWorkspace("provider-role-model-config", t);
  const nestedCwd = path.join(root, "packages", "app");
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });

  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=openai-compatible",
      "DEADMOUSE_API_KEY=default-key",
      "DEADMOUSE_BASE_URL=https://default.example.test/v1",
      "DEADMOUSE_MODEL=default-model",
      "DEADMOUSE_THINKING=enabled",
      "DEADMOUSE_REASONING_EFFORT=max",
      "DEADMOUSE_LEAD_PROVIDER=openai",
      "DEADMOUSE_LEAD_API_KEY=lead-key",
      "DEADMOUSE_LEAD_BASE_URL=https://lead.example.test/v1",
      "DEADMOUSE_LEAD_MODEL=gpt-5.4",
      "DEADMOUSE_LEAD_REASONING_EFFORT=xhigh",
      "DEADMOUSE_TEAMMATE_PROVIDER=openai-compatible",
      "DEADMOUSE_TEAMMATE_API_KEY=team-key",
      "DEADMOUSE_TEAMMATE_BASE_URL=https://api.siliconflow.cn/v1",
      "DEADMOUSE_TEAMMATE_MODEL=deepseek-ai/DeepSeek-V3.2",
      "DEADMOUSE_SUBAGENT_PROVIDER=deepseek",
      "DEADMOUSE_SUBAGENT_API_KEY=subagent-key",
      "DEADMOUSE_SUBAGENT_BASE_URL=https://api.deepseek.com",
      "DEADMOUSE_SUBAGENT_MODEL=deepseek-v4-pro",
      "DEADMOUSE_SUBAGENT_THINKING=disabled",
      "DEADMOUSE_SUBAGENT_REASONING_EFFORT=high",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv([
    "DEADMOUSE_PROVIDER",
    "DEADMOUSE_API_KEY",
    "DEADMOUSE_BASE_URL",
    "DEADMOUSE_MODEL",
    "DEADMOUSE_THINKING",
    "DEADMOUSE_REASONING_EFFORT",
    "DEADMOUSE_LEAD_PROVIDER",
    "DEADMOUSE_LEAD_API_KEY",
    "DEADMOUSE_LEAD_BASE_URL",
    "DEADMOUSE_LEAD_MODEL",
    "DEADMOUSE_LEAD_THINKING",
    "DEADMOUSE_LEAD_REASONING_EFFORT",
    "DEADMOUSE_TEAMMATE_PROVIDER",
    "DEADMOUSE_TEAMMATE_API_KEY",
    "DEADMOUSE_TEAMMATE_BASE_URL",
    "DEADMOUSE_TEAMMATE_MODEL",
    "DEADMOUSE_TEAMMATE_THINKING",
    "DEADMOUSE_TEAMMATE_REASONING_EFFORT",
    "DEADMOUSE_SUBAGENT_PROVIDER",
    "DEADMOUSE_SUBAGENT_API_KEY",
    "DEADMOUSE_SUBAGENT_BASE_URL",
    "DEADMOUSE_SUBAGENT_MODEL",
    "DEADMOUSE_SUBAGENT_THINKING",
    "DEADMOUSE_SUBAGENT_REASONING_EFFORT",
  ]);

  try {
    restoreEnv(Object.fromEntries(Object.keys(previous).map((key) => [key, undefined])));

    const runtime = await resolveRuntimeConfig({ cwd: nestedCwd });
    assert.deepEqual(runtime.agentModels.lead, {
      provider: "openai",
      apiKey: "lead-key",
      baseUrl: "https://lead.example.test/v1",
      model: "gpt-5.4",
      thinking: "enabled",
      reasoningEffort: "xhigh",
    });
    assert.deepEqual(runtime.agentModels.teammate, {
      provider: "openai-compatible",
      apiKey: "team-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "deepseek-ai/DeepSeek-V3.2",
      thinking: "enabled",
      reasoningEffort: "max",
    });
    assert.deepEqual(runtime.agentModels.subagent, {
      provider: "deepseek",
      apiKey: "subagent-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      thinking: "disabled",
      reasoningEffort: "high",
    });
  } finally {
    restoreEnv(previous);
  }
});

test("resolveRuntimeConfig falls role model profiles back to the default provider bundle", async (t) => {
  const root = await createTempWorkspace("provider-role-model-fallback", t);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_PROVIDER=openai-compatible",
      "DEADMOUSE_API_KEY=default-key",
      "DEADMOUSE_BASE_URL=https://default.example.test/v1",
      "DEADMOUSE_MODEL=default-model",
      "DEADMOUSE_SUBAGENT_MODEL=subagent-only-model",
    ].join("\n"),
    "utf8",
  );

  const previous = snapshotEnv([
    "DEADMOUSE_PROVIDER",
    "DEADMOUSE_API_KEY",
    "DEADMOUSE_BASE_URL",
    "DEADMOUSE_MODEL",
    "DEADMOUSE_SUBAGENT_MODEL",
  ]);

  try {
    restoreEnv(Object.fromEntries(Object.keys(previous).map((key) => [key, undefined])));

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.deepEqual(runtime.agentModels.lead, {
      provider: "openai-compatible",
      apiKey: "default-key",
      baseUrl: "https://default.example.test/v1",
      model: "default-model",
      thinking: undefined,
      reasoningEffort: undefined,
    });
    assert.deepEqual(runtime.agentModels.subagent, {
      provider: "openai-compatible",
      apiKey: "default-key",
      baseUrl: "https://default.example.test/v1",
      model: "subagent-only-model",
      thinking: undefined,
      reasoningEffort: undefined,
    });
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
