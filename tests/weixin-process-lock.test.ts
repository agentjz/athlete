import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { acquireWeixinProcessLock } from "../src/weixin/processLock.js";
import { createTempWorkspace } from "./helpers.js";

test("weixin process lock blocks a second live service instance", async (t) => {
  const root = await createTempWorkspace("weixin-process-lock-live", t);
  const stateDir = path.join(root, ".athlete", "weixin");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "service.pid"), "4242\n", "utf8");

  await assert.rejects(
    () =>
      acquireWeixinProcessLock({
        stateDir,
        processId: 5252,
        isProcessAlive: async (pid) => pid === 4242,
      }),
    /already running with PID 4242/i,
  );

  assert.equal(await fs.readFile(path.join(stateDir, "service.pid"), "utf8"), "4242\n");
});

test("weixin process lock replaces a stale pid file and removes it on release", async (t) => {
  const root = await createTempWorkspace("weixin-process-lock-stale", t);
  const stateDir = path.join(root, ".athlete", "weixin");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "service.pid"), "4242\n", "utf8");

  const lock = await acquireWeixinProcessLock({
    stateDir,
    processId: 5252,
    isProcessAlive: async () => false,
  });

  assert.equal(await fs.readFile(path.join(stateDir, "service.pid"), "utf8"), "5252\n");

  await lock.release();

  await assert.rejects(
    () => fs.readFile(path.join(stateDir, "service.pid"), "utf8"),
    /ENOENT/i,
  );
});
