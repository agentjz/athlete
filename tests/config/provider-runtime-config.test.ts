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
      DEADMOUSE_PROFILE: "runtime-profile",
    });

    const runtime = await resolveRuntimeConfig({ cwd: root });
    assert.equal(runtime.profile, "runtime-profile");
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
