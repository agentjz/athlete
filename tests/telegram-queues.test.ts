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

test("telegram turn display emits assistant stages, tool result previews, todo previews, and the final assistant reply", async () => {
  const messages: Array<{ chatId: number; text: string }> = [];
  const typingCalls: number[] = [];
  const scheduled: Array<() => Promise<void> | void> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async (chatId) => {
      typingCalls.push(chatId);
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ chatId: target.chatId, text });
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
  display.callbacks.onReasoningDelta?.("reasoning-1");
  display.callbacks.onReasoningDelta?.("reasoning-2");
  display.callbacks.onAssistantDelta?.("assistant stage");
  display.callbacks.onToolCall?.("search_files", "{\"pattern\":\"todo\"}");
  display.callbacks.onToolCall?.("search_files", "{\"pattern\":\"todo\"}");
  display.callbacks.onToolResult?.("search_files", "{\"preview\":\"matched TODO in src/app.ts line 10\"}");
  display.callbacks.onToolResult?.("search_files", "{\"preview\":\"matched TODO in src/ui.ts line 22\"}");
  display.callbacks.onToolResult?.(
    "todo_write",
    JSON.stringify({
      ok: true,
      preview: "[ ] #1: same todo preview",
    }),
  );
  display.callbacks.onToolResult?.(
    "todo_write",
    JSON.stringify({
      ok: true,
      preview: "[ ] #1: same todo preview",
    }),
  );
  display.callbacks.onAssistantDelta?.("assistant");
  display.callbacks.onAssistantDelta?.(" content");
  display.callbacks.onAssistantDone?.("assistant content");
  await scheduled[0]?.();
  await display.flush();
  display.dispose();

  assert.deepEqual(typingCalls, [99, 99]);
  assert.deepEqual(messages, [
    { chatId: 99, text: "assistant stage" },
    { chatId: 99, text: "matched TODO in src/app.ts line 10" },
    { chatId: 99, text: "matched TODO in src/ui.ts line 22" },
    { chatId: 99, text: "[ ] #1: same todo preview" },
    { chatId: 99, text: "[ ] #1: same todo preview" },
    { chatId: 99, text: "assistant content" },
  ]);
});

test("telegram turn display hides reasoning events from chat output", async () => {
  const messages: Array<{ chatId: number; text: string }> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ chatId: target.chatId, text });
    },
    typingIntervalMs: 500,
    scheduleTypingTick() {
      return {
        cancel() {
          return;
        },
      };
    },
  });

  display.callbacks.onReasoningDelta?.("reasoning-1");
  display.callbacks.onReasoning?.("reasoning-2");
  await display.flush();
  display.dispose();

  assert.deepEqual(messages, []);
});

test("telegram turn display emits onAssistantText once and does not replay it at onAssistantDone", async () => {
  const messages: Array<{ chatId: number; text: string }> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ chatId: target.chatId, text });
    },
    typingIntervalMs: 500,
    scheduleTypingTick() {
      return {
        cancel() {
          return;
        },
      };
    },
  });

  display.callbacks.onAssistantText?.("assistant-text");
  display.callbacks.onAssistantDone?.("assistant-text");
  await display.flush();
  display.dispose();

  assert.deepEqual(messages, [{ chatId: 99, text: "assistant-text" }]);
});

test("telegram turn display emits non-streamed assistant stage text before todo previews", async () => {
  const messages: Array<{ chatId: number; text: string }> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ chatId: target.chatId, text });
    },
    typingIntervalMs: 500,
    scheduleTypingTick() {
      return {
        cancel() {
          return;
        },
      };
    },
  });

  (
    display.callbacks as {
      onAssistantStage?: (text: string) => void;
    }
  ).onAssistantStage?.("现在我先检查目录。");
  display.callbacks.onToolCall?.("list_files", "{\"path\":\"Desktop\"}");
  display.callbacks.onToolResult?.(
    "list_files",
    JSON.stringify({
      entries: [
        { type: "file", path: "Desktop/.env" },
        { type: "directory", path: "Desktop/athlete" },
      ],
    }),
  );
  display.callbacks.onToolResult?.(
    "todo_write",
    JSON.stringify({
      ok: true,
      preview: "[x] #1: same todo preview",
    }),
  );
  display.callbacks.onAssistantDone?.("检查完成。");
  await display.flush();
  display.dispose();

  assert.deepEqual(messages, [
    { chatId: 99, text: "现在我先检查目录。" },
    { chatId: 99, text: "file Desktop/.env dir Desktop/athlete" },
    { chatId: 99, text: "[x] #1: same todo preview" },
    { chatId: 99, text: "检查完成。" },
  ]);
});

test("telegram turn display truncates tool result previews to 150 characters", async () => {
  const messages: Array<{ chatId: number; text: string }> = [];

  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ chatId: target.chatId, text });
    },
    typingIntervalMs: 500,
    scheduleTypingTick() {
      return {
        cancel() {
          return;
        },
      };
    },
  });

  display.callbacks.onToolResult?.(
    "search_files",
    JSON.stringify({
      preview: "A".repeat(160),
    }),
  );
  await display.flush();
  display.dispose();

  assert.deepEqual(messages, [{ chatId: 99, text: `${"A".repeat(150)}...` }]);
});

test("telegram turn display surfaces durable enqueue failures instead of swallowing them", async () => {
  const display = new TelegramTurnDisplay({
    chatId: 99,
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async () => {
      throw new Error("durable enqueue failed");
    },
    typingIntervalMs: 500,
    scheduleTypingTick() {
      return {
        cancel() {
          return;
        },
      };
    },
  });

  display.callbacks.onAssistantText?.("assistant");

  await assert.rejects(display.flush(), /durable enqueue failed/);
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
