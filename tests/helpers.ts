import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import type { RuntimeConfig } from "../src/types.js";
import { getDefaultPlaywrightMcpConfig } from "../src/mcp/playwright/config.js";

process.env.DEADMOUSE_TEST_WORKER_MODE = "stub";

export async function createTempWorkspace(prefix: string, t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `deadmouse-test-${prefix}-`));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

export function makeToolContext(root: string, cwd = root, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    config: createTestRuntimeConfig(root),
    cwd,
    sessionId: "test-session",
    identity: {
      kind: "lead",
      name: "lead",
    },
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      skills: [],
      ignoreRules: [],
    },
    changeStore: {},
    createToolRegistry: () => ({}),
    ...overrides,
  };
}

export async function initGitRepo(root: string): Promise<void> {
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Codex Tests"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: root, stdio: "ignore" });
  await fs.writeFile(path.join(root, "README.md"), "# test repo\n", "utf8");
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "ignore" });
}

export function createTestRuntimeConfig(root: string): RuntimeConfig {
  return {
    schemaVersion: 1,
    provider: "deepseek",
    apiKey: "test-key",
    agentModels: {
      lead: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        thinking: "enabled",
      },
      teammate: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        thinking: "enabled",
      },
      subagent: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        thinking: "enabled",
      },
    },
    mineru: {
      token: "test-mineru-token",
      baseUrl: "https://mineru.net/api/v4",
      modelVersion: "vlm",
      language: "ch",
      enableTable: true,
      enableFormula: true,
      pollIntervalMs: 2_000,
      timeoutMs: 300_000,
    },
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    thinking: "enabled",
    mode: "agent",
    yieldAfterToolSteps: 5,
    contextWindowMessages: 30,
    maxContextChars: 48_000,
    contextSummaryChars: 8_000,
    maxToolIterations: 8,
    maxContinuationBatches: 8,
    providerRecoveryMaxAttempts: 6,
    providerRecoveryMaxElapsedMs: 120_000,
    managedTurnMaxSlices: 8,
    managedTurnMaxElapsedMs: 180_000,
    maxReadBytes: 120_000,
    maxSearchResults: 80,
    maxSpreadsheetPreviewRows: 20,
    maxSpreadsheetPreviewColumns: 12,
    commandStallTimeoutMs: 30_000,
    commandMaxRetries: 1,
    commandRetryBackoffMs: 1_500,
    showReasoning: true,
    mcp: {
      enabled: false,
      servers: [],
      playwright: getDefaultPlaywrightMcpConfig(),
    },
    telegram: {
      token: "test-telegram-token",
      apiBaseUrl: "https://api.telegram.org",
      proxyUrl: "",
      allowedUserIds: [1001],
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
      stateDir: path.join(root, ".deadmouse", "telegram"),
    },
    paths: {
      configDir: root,
      dataDir: root,
      cacheDir: root,
      configFile: path.join(root, "config.json"),
      sessionsDir: path.join(root, "sessions"),
      changesDir: path.join(root, "changes"),
    },
  };
}

export function createCheckpointFixture(
  objective: string,
  overrides: {
    status?: string;
    completedSteps?: string[];
    currentStep?: string;
    nextStep?: string;
    recentToolBatch?: Record<string, unknown>;
    flow?: Record<string, unknown>;
    priorityArtifacts?: Array<Record<string, unknown>>;
    updatedAt?: string;
  } = {},
): Record<string, unknown> {
  const timestamp = overrides.updatedAt ?? new Date().toISOString();

  return {
    version: 1,
    objective,
    status: overrides.status ?? "active",
    completedSteps: overrides.completedSteps ?? [],
    currentStep: overrides.currentStep,
    nextStep: overrides.nextStep,
    recentToolBatch: overrides.recentToolBatch,
    flow: {
      phase: "active",
      updatedAt: timestamp,
      ...(overrides.flow ?? {}),
    },
    priorityArtifacts: overrides.priorityArtifacts ?? [],
    updatedAt: timestamp,
  };
}
