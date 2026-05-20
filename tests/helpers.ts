import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import { ChangeStore } from "../src/agent/changes/store.js";
import type { ToolContext } from "../src/tools/core/types.js";
import type { RuntimeConfig } from "../src/types.js";

export async function createTempWorkspace(prefix: string, t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `Kitty-test-${prefix}-`));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

export function createTestRuntimeConfig(root: string): RuntimeConfig {
  return {
    schemaVersion: 1,
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    profile: "intp",
    thinking: "enabled",
    contextWindowMessages: 120,
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
    maxReadBytes: 120_000,
    commandStallTimeoutMs: 30_000,
    showReasoning: true,
    telegram: {
      token: "",
      apiBaseUrl: "https://api.telegram.org",
      proxyUrl: "",
      allowedUserIds: [],
      polling: {
        timeoutSeconds: 10,
        limit: 10,
        retryBackoffMs: 1_000,
      },
      delivery: {
        maxRetries: 4,
        baseDelayMs: 250,
        maxDelayMs: 10_000,
      },
      messageChunkChars: 3_500,
      typingIntervalMs: 4_000,
      stateDir: path.join(root, ".kitty", "telegram"),
    },
    extensions: {
      todo: true,
      worktree: false,
      network: false,
      spec: false,
    },
    paths: {
      configDir: path.join(root, ".kitty"),
      dataDir: path.join(root, ".kitty"),
      cacheDir: path.join(root, ".kitty", "cache"),
      configFile: path.join(root, ".kitty", "config.json"),
      sessionsDir: path.join(root, ".kitty", "sessions"),
      changesDir: path.join(root, ".kitty", "changes"),
    },
  };
}

export function createToolContext(root: string): ToolContext {
  const config = createTestRuntimeConfig(root);
  return {
    config,
    cwd: root,
    sessionId: "test-session",
    identity: {
      kind: "lead",
      name: "lead",
    },
    runtimeState: {},
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
    },
    changeStore: new ChangeStore(config.paths.changesDir),
    createToolRegistry: () => ({
      definitions: [],
      execute: async () => ({ ok: false, output: "unimplemented" }),
    }),
  };
}

export function parseToolJson(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}
