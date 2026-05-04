import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildCliProgram } from "../../src/cli.js";
import type { RuntimeConfig, SessionRecord } from "../../src/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

test("CLI exposes explicit agent and spec modes", async (t) => {
  const root = await createTempWorkspace("spec-cli", t);
  const config = createTestRuntimeConfig(root);
  const started: string[] = [];
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    startInteractive: async (options) => {
      started.push(`agent:${options.cwd}`);
    },
  });
  program.exitOverride();

  await program.parseAsync(["agent"], { from: "user" });

  assert.deepEqual(started, [`agent:${root}`]);
});

test("agent one-shot command goes through agent command path", async (t) => {
  const root = await createTempWorkspace("spec-cli-one-shot", t);
  const config = createTestRuntimeConfig(root);
  let oneShotPrompt = "";
  let stdout = "";
  const originalWriteSync = fs.writeSync;
  (fs.writeSync as unknown as (...args: unknown[]) => number) = ((fd: unknown, buffer: unknown) => {
    if (fd === 1) {
      stdout += String(buffer ?? "");
      return String(buffer ?? "").length;
    }

    return (originalWriteSync as unknown as (...args: unknown[]) => number)(fd, buffer);
  }) as never;

  t.after(() => {
    fs.writeSync = originalWriteSync;
  });

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runOneShot: async (options: {
      prompt: string;
      cwd: string;
      config: RuntimeConfig;
      session: SessionRecord;
    }) => {
      oneShotPrompt = options.prompt;
      return {
        session: options.session,
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
          verification: {
            status: "idle",
            observedPaths: [],
            attempts: 0,
          },
          acceptance: {
            status: "idle",
            pendingChecks: [],
            stalledPhaseCount: 0,
          },
        },
      };
    },
  });
  program.exitOverride();

  await program.parseAsync(["agent", "修 README"], { from: "user" });

  assert.equal(oneShotPrompt, "修 README");
  assert.equal(stdout.trim(), "");
});

test("agent one-shot reports unfinished turns as CLI failures", async (t) => {
  const root = await createTempWorkspace("agent-one-shot-failed", t);
  const config = createTestRuntimeConfig(root);
  let stderr = "";
  const originalWriteSync = fs.writeSync;
  const originalExitCode = process.exitCode;
  (fs.writeSync as unknown as (...args: unknown[]) => number) = ((fd: unknown, buffer: unknown) => {
    if (fd === 2) {
      stderr += String(buffer ?? "");
      return String(buffer ?? "").length;
    }

    return (originalWriteSync as unknown as (...args: unknown[]) => number)(fd, buffer);
  }) as never;

  t.after(() => {
    fs.writeSync = originalWriteSync;
    process.exitCode = originalExitCode;
  });

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runOneShot: async (options: {
      session: SessionRecord;
    }) => ({
      session: options.session,
      closeout: {
        sessionId: options.session.id,
        completed: false,
        unfinishedReason: "Missing API key. Open the project's .env file and add KITTY_API_KEY.",
        terminalTransition: null,
        verification: {
          status: "idle",
          observedPaths: [],
          attempts: 0,
        },
        acceptance: {
          status: "idle",
          pendingChecks: [],
          stalledPhaseCount: 0,
        },
      },
    }),
  });
  program.exitOverride();

  await program.parseAsync(["agent", "修 README"], { from: "user" });

  assert.match(stderr, /Missing API key/);
  assert.equal(process.exitCode, 1);
});

test("spec mode has an explicit resume entry instead of cross-session auto-pollution", async (t) => {
  const root = await createTempWorkspace("spec-cli-resume", t);
  const config = createTestRuntimeConfig(root);
  const started: string[] = [];
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runSpecOneShot: async (options) => ({
      session: options.session,
      closeout: {
        sessionId: options.session.id,
        completed: true,
        terminalTransition: null,
        verification: {
          status: "idle",
          observedPaths: [],
          attempts: 0,
        },
        acceptance: {
          status: "idle",
          pendingChecks: [],
          stalledPhaseCount: 0,
        },
      },
    }),
    startSpecInteractive: async (options) => {
      started.push(options.session.id);
    },
  });
  program.exitOverride();

  await program.parseAsync(["spec", "seed spec"], { from: "user" });
  await program.parseAsync(["spec", "--resume"], { from: "user" });

  assert.equal(started.length, 1);
});
