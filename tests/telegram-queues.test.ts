import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { PerPeerCommandQueue } from "../src/telegram/commandQueue.js";
import {
  TelegramDeliveryQueue,
  type TelegramDeliveryTarget,
} from "../src/telegram/deliveryQueue.js";
import { TelegramTurnDisplay } from "../src/telegram/turnDisplay.js";
import { createTempWorkspace } from "./helpers.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("telegram per-peer command queue serializes turns for the same peer while allowing parallel peers", async () => {
  const queue = new PerPeerCommandQueue();
  const events: string[] = [];

  await Promise.all([
    queue.enqueue("telegram:private:1", async () => {
      events.push("peer1-start-1");
      await delay(40);
      events.push("peer1-end-1");
      return "one";
    }),
    queue.enqueue("telegram:private:1", async () => {
      events.push("peer1-start-2");
      events.push("peer1-end-2");
      return "two";
    }),
    queue.enqueue("telegram:private:2", async () => {
      events.push("peer2-start-1");
      await delay(5);
      events.push("peer2-end-1");
      return "three";
    }),
  ]);

  const peer1Start2Index = events.indexOf("peer1-start-2");
  const peer1End1Index = events.indexOf("peer1-end-1");
  const peer2Start1Index = events.indexOf("peer2-start-1");

  assert.equal(peer1Start2Index > peer1End1Index, true);
  assert.equal(peer2Start1Index > -1, true);
  assert.equal(peer2Start1Index < peer1End1Index, true);
});

test("telegram turn display only emits tool names, todo previews, and the final reply", async () => {
  const deliveries: Array<{ chatId: number; text: string }> = [];
  const stageMessages: Array<{ chatId: number; text: string }> = [];
  const typingCalls: number[] = [];
  const scheduled: Array<() => Promise<void> | void> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async (chatId) => {
      typingCalls.push(chatId);
    },
    sendProgressMessage: async (chatId, text) => {
      stageMessages.push({ chatId, text });
      return {
        chatId,
        messageId: stageMessages.length,
      };
    },
    enqueueReply: async (target, text) => {
      deliveries.push({ chatId: target.chatId, text });
    },
    typingIntervalMs: 500,
    scheduleTypingTick(callback) {
      scheduled.push(callback);
      return {
        cancel() {
          return;
        },
      };
    },
  });

  display.callbacks.onStatus?.("thinking");
  display.callbacks.onAssistantDelta?.("hello");
  await scheduled[0]?.();
  display.callbacks.onReasoningDelta?.("First, inspect the task. ");
  display.callbacks.onReasoningDelta?.("Then decide the next step.");
  display.callbacks.onToolCall?.("search_files", "{\"pattern\":\"todo\"}");
  display.callbacks.onToolResult?.("search_files", "sensitive output should stay hidden");
  display.callbacks.onToolCall?.(
    "todo_write",
    JSON.stringify({
      items: [
        { id: "1", text: "Inspect repo", status: "completed" },
        { id: "2", text: "Update docs", status: "in_progress" },
      ],
    }),
  );
  display.callbacks.onToolResult?.(
    "todo_write",
    JSON.stringify({
      ok: true,
      items: [
        { id: "1", text: "Inspect repo", status: "completed" },
        { id: "2", text: "Update docs", status: "in_progress" },
      ],
      preview: "[x] #1: Inspect repo\n[>] #2: Update docs\n- Progress: 1/2 completed",
    }),
  );
  display.callbacks.onStatus?.("organizing final answer");
  display.callbacks.onAssistantDelta?.(" world");
  display.callbacks.onAssistantText?.("hello world");
  display.callbacks.onAssistantDone?.("hello world");
  await display.flush();
  display.dispose();

  assert.deepEqual(typingCalls, [99, 99]);
  assert.deepEqual(stageMessages, [
    { chatId: 99, text: "search_files" },
    { chatId: 99, text: "todo_write" },
    { chatId: 99, text: "[x] #1: Inspect repo\n[>] #2: Update docs\n- Progress: 1/2 completed" },
  ]);
  assert.deepEqual(deliveries, [{ chatId: 99, text: "hello world" }]);
});

test("telegram delivery queue retries failed sends with persisted backoff and restart recovery", async (t) => {
  const root = await createTempWorkspace("telegram-delivery", t);
  const queuePath = path.join(root, "delivery.json");
  const sent: Array<{ chatId: number; text: string }> = [];
  let now = 1_000;
  let failNextSend = true;

  const target: TelegramDeliveryTarget = {
    async sendMessage(request) {
      if (failNextSend) {
        failNextSend = false;
        throw new Error("temporary telegram outage");
      }

      sent.push({ chatId: request.chatId, text: request.text });
    },
    async sendDocument() {
      throw new Error("unexpected document delivery in text retry test");
    },
  };

  const queue = new TelegramDeliveryQueue({
    storePath: queuePath,
    target,
    now: () => now,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2000,
    },
  });

  await queue.enqueue({
    chatId: 42,
    text: "queued reply",
  });

  await queue.flushDue();

  let pending = await queue.listPending();
  assert.equal(pending.length, 1);
  const firstPending = pending[0]!;
  assert.equal(firstPending.attemptCount, 1);
  assert.equal(firstPending.nextAttemptAt > now, true);

  now = firstPending.nextAttemptAt + 1;

  const restored = new TelegramDeliveryQueue({
    storePath: queuePath,
    target,
    now: () => now,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2000,
    },
  });

  await restored.flushDue();

  pending = await restored.listPending();
  assert.deepEqual(pending, []);
  assert.deepEqual(sent, [{ chatId: 42, text: "queued reply" }]);
});
