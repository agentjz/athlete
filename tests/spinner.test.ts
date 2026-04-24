import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createWaitingSpinner, wrapCallbacksWithSpinnerStop } from "../src/ui/spinner.js";

test("waiting spinner renders frames and clears on stop", async () => {
  const writes: string[] = [];
  const spinner = createWaitingSpinner({
    enabled: true,
    intervalMs: 50,
    label: "thinking",
    write: (text) => {
      writes.push(text);
    },
  });

  spinner.start();
  await sleep(120);
  spinner.stop();

  assert.equal(spinner.isActive(), false);
  assert.ok(writes.length >= 3);
  assert.ok(writes.some((entry) => entry.includes("[■   ] thinking") || entry.includes("[ ■  ] thinking")));
  assert.ok(writes.at(-1)?.includes("\r"));
});

test("wrapped callbacks stop spinner on first visible activity", () => {
  let stopCount = 0;
  const wrapped = wrapCallbacksWithSpinnerStop(
    {
      onAssistantDelta() {
        // noop
      },
      onToolCall() {
        // noop
      },
    },
    () => {
      stopCount += 1;
    },
  );

  wrapped.onAssistantDelta?.("a");
  wrapped.onToolCall?.("read_file", "{}");

  assert.equal(stopCount, 2);
});
