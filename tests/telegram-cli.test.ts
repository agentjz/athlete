import assert from "node:assert/strict";
import test from "node:test";

import { buildCliProgram } from "../src/cli.js";
import { createTestRuntimeConfig } from "./helpers.js";

test("CLI exposes a formal telegram serve command without hijacking the default interactive mode", async () => {
  const started: string[] = [];
  const runtimeConfig = createTestRuntimeConfig(process.cwd());
  const program = buildCliProgram({
    startInteractive: async () => {
      started.push("interactive");
    },
    resolveRuntime: async () => ({
      cwd: process.cwd(),
      config: runtimeConfig,
      paths: runtimeConfig.paths,
      overrides: {},
    }),
    createTelegramService: async () => ({
      async run() {
        started.push("telegram");
      },
    }),
    acquireProcessLock: async () => ({
      pidFilePath: "test.pid",
      async release() {
        return;
      },
    }),
  });

  await program.parseAsync(["telegram", "serve"], {
    from: "user",
  });

  assert.deepEqual(started, ["telegram"]);
});

test("telegram serve refuses to start a second service instance when the process lock is already held", async () => {
  const started: string[] = [];
  const runtimeConfig = createTestRuntimeConfig(process.cwd());
  const program = buildCliProgram({
    startInteractive: async () => {
      started.push("interactive");
    },
    resolveRuntime: async () => ({
      cwd: process.cwd(),
      config: runtimeConfig,
      paths: runtimeConfig.paths,
      overrides: {},
    }),
    createTelegramService: async () => ({
      async run() {
        started.push("telegram");
      },
    }),
    acquireProcessLock: async () => {
      throw new Error("Telegram process lock already running");
    },
  });
  program.exitOverride();

  await assert.rejects(
    () =>
      program.parseAsync(["telegram", "serve"], {
        from: "user",
      }),
    /already running|process lock/i,
  );
  assert.deepEqual(started, []);
});
