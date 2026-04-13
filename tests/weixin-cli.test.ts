import assert from "node:assert/strict";
import test from "node:test";

import { buildCliProgram } from "../src/cli.js";
import { createTestRuntimeConfig } from "./helpers.js";

test("CLI exposes formal weixin login serve logout commands without hijacking the default interactive mode", async () => {
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
    loginWeixin: async () => {
      started.push("weixin-login");
    },
    createWeixinService: async () => ({
      async run() {
        started.push("weixin-serve");
      },
    }),
    logoutWeixin: async () => {
      started.push("weixin-logout");
    },
    acquireWeixinProcessLock: async () => ({
      pidFilePath: "test.pid",
      async release() {
        return;
      },
    }),
  });

  await program.parseAsync(["weixin", "login"], { from: "user" });
  await program.parseAsync(["weixin", "serve"], { from: "user" });
  await program.parseAsync(["weixin", "logout"], { from: "user" });

  assert.deepEqual(started, ["weixin-login", "weixin-serve", "weixin-logout"]);
});

test("weixin serve refuses to start when there is no login state", async () => {
  const runtimeConfig = createTestRuntimeConfig(process.cwd());
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: process.cwd(),
      config: {
        ...runtimeConfig,
        weixin: {
          ...runtimeConfig.weixin,
          credentials: null,
        },
      },
      paths: runtimeConfig.paths,
      overrides: {},
    }),
  });
  program.exitOverride();

  await assert.rejects(
    () =>
      program.parseAsync(["weixin", "serve"], {
        from: "user",
      }),
    /weixin login required|not logged in/i,
  );
});

test("weixin serve refuses to start a second instance when the process lock is already held", async () => {
  const started: string[] = [];
  const runtimeConfig = createTestRuntimeConfig(process.cwd());
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: process.cwd(),
      config: runtimeConfig,
      paths: runtimeConfig.paths,
      overrides: {},
    }),
    createWeixinService: async () => ({
      async run() {
        started.push("weixin");
      },
    }),
    acquireWeixinProcessLock: async () => {
      throw new Error("Weixin process lock already running");
    },
  });
  program.exitOverride();

  await assert.rejects(
    () =>
      program.parseAsync(["weixin", "serve"], {
        from: "user",
      }),
    /already running|process lock/i,
  );
  assert.deepEqual(started, []);
});
