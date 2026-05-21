import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

import { ChangeStore } from "../src/agent/changes/store.js";
import { getAppPaths } from "../src/config/paths.js";
import { resolveTelegramRuntimeConfig } from "../src/config/hosts.js";
import { getInitialRuntimeConfig } from "../src/config/initialConfig.js";
import type { ToolContext } from "../src/tools/core/types.js";
import type { RuntimeConfig } from "../src/types.js";

export async function createTempWorkspace(prefix: string, t: TestContext): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `Kitty-test-${prefix}-`));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

export async function initGitRepo(root: string): Promise<void> {
  const { execa } = await import("execa");
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  for (const args of [
    ["init"],
    ["config", "user.email", "kitty@example.test"],
    ["config", "user.name", "Kitty Test"],
    ["add", "README.md"],
    ["commit", "-m", "initial"],
  ]) {
    const result = await execa("git", args, {
      cwd: root,
      all: true,
      reject: false,
      windowsHide: true,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.all ?? `git ${args.join(" ")} failed`);
    }
  }
}

export function createTestRuntimeConfig(root: string): RuntimeConfig {
  const initialConfig = getInitialRuntimeConfig();
  return {
    ...initialConfig,
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    thinking: "enabled",
    telegram: resolveTelegramRuntimeConfig(initialConfig.telegram, root),
    extensions: {
      ...initialConfig.extensions,
    },
    paths: getAppPaths(root),
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
