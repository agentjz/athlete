import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { acquireTelegramProcessLock } from "../src/telegram/processLock.js";
import { createTempWorkspace } from "./helpers.js";

test("telegram process lock blocks a second live service instance", async (t) => {
  const root = await createTempWorkspace("telegram-process-lock-live", t);
  const stateDir = path.join(root, ".deadmouse", "telegram");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "service.pid"), "4242\n", "utf8");

  await assert.rejects(
    () =>
      acquireTelegramProcessLock({
        stateDir,
        processId: 5252,
        isProcessAlive: async (pid) => pid === 4242,
      }),
    /already running with PID 4242/i,
  );

  assert.equal(await fs.readFile(path.join(stateDir, "service.pid"), "utf8"), "4242\n");
});

test("telegram process lock replaces a stale pid file and removes it on release", async (t) => {
  const root = await createTempWorkspace("telegram-process-lock-stale", t);
  const stateDir = path.join(root, ".deadmouse", "telegram");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "service.pid"), "4242\n", "utf8");

  const lock = await acquireTelegramProcessLock({
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
