import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { resolveRuntimeConfig } from "../src/config/store.js";
import { createTempWorkspace } from "./helpers.js";

test("resolveRuntimeConfig takes provider truth from the project .athlete/.env and ignores TT-config auth sidecars", async (t) => {
  const root = await createTempWorkspace("provider-runtime-config", t);
  const nestedCwd = path.join(root, "packages", "app");
  const ttConfigDir = path.join(root, "TT-config auth");
  await fs.mkdir(path.join(root, ".athlete"), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.mkdir(ttConfigDir, { recursive: true });

  await fs.writeFile(
    path.join(root, ".athlete", ".env"),
    [
      "ATHLETE_PROVIDER=openai",
      "ATHLETE_API_KEY=project-key",
      "ATHLETE_BASE_URL=https://relay.example.test/v1",
      "ATHLETE_MODEL=gpt-5.4",
    ].join("\n"),
    "utf8",
  );

  await fs.writeFile(
    path.join(ttConfigDir, "config.toml"),
    [
      "model_provider = \"OpenAI\"",
      "model = \"deepseek-reasoner\"",
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
    "ATHLETE_PROVIDER",
    "ATHLETE_API_KEY",
    "ATHLETE_BASE_URL",
    "ATHLETE_MODEL",
  ]);

  try {
    restoreEnv({
      ATHLETE_PROVIDER: undefined,
      ATHLETE_API_KEY: undefined,
      ATHLETE_BASE_URL: undefined,
      ATHLETE_MODEL: undefined,
    });

    const runtime = await resolveRuntimeConfig({ cwd: nestedCwd });
    assert.equal(runtime.provider, "openai");
    assert.equal(runtime.apiKey, "project-key");
    assert.equal(runtime.baseUrl, "https://relay.example.test/v1");
    assert.equal(runtime.model, "gpt-5.4");
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
