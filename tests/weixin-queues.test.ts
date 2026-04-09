import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { PerPeerCommandQueue } from "../src/weixin/commandQueue.js";
import { FileWeixinContextTokenStore } from "../src/weixin/contextTokenStore.js";
import {
  WeixinContextTokenDeliveryError,
  WeixinDeliveryQueue,
  type WeixinDeliveryTarget,
} from "../src/weixin/deliveryQueue.js";
import { chunkWeixinMessage } from "../src/weixin/messageChunking.js";
import { WeixinTurnDisplay } from "../src/weixin/turnDisplay.js";
import { createTempWorkspace } from "./helpers.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("weixin per-peer command queue serializes turns for the same peer while allowing parallel peers", async () => {
  const queue = new PerPeerCommandQueue();
  const events: string[] = [];

  await Promise.all([
    queue.enqueue("weixin:private:wxid_alice", async () => {
      events.push("peer1-start-1");
      await delay(40);
      events.push("peer1-end-1");
      return "one";
    }),
    queue.enqueue("weixin:private:wxid_alice", async () => {
      events.push("peer1-start-2");
      events.push("peer1-end-2");
      return "two";
    }),
    queue.enqueue("weixin:private:wxid_bob", async () => {
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

test("weixin message chunking uses a utf8 byte budget so long Chinese replies split before platform-visible overflow", () => {
  const longChineseReply = "根据我对当前目录和 README 文件的了解，让我向你介绍我的功能和能力。".repeat(40);
  const chunks = chunkWeixinMessage(longChineseReply, 350);

  assert.equal(chunks.length > 1, true);
  for (const chunk of chunks) {
    assert.equal(Buffer.byteLength(chunk, "utf8") <= 350, true);
  }
});

test("weixin turn display only emits the final assistant reply to chat output", async () => {
  const messages: Array<{ userId: string; text: string }> = [];
  const typingCalls: string[] = [];
  const scheduled: Array<() => Promise<void> | void> = [];

  const display = new WeixinTurnDisplay({
    userId: "wxid_alice",
    sendTyping: async (userId) => {
      typingCalls.push(userId);
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ userId: target.userId, text });
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
  display.callbacks.onToolCall?.("search_files", "{\"pattern\":\"todo\"}");
  display.callbacks.onToolCall?.("search_files", "{\"pattern\":\"todo\"}");
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

  assert.deepEqual(typingCalls, ["wxid_alice", "wxid_alice"]);
  assert.deepEqual(messages, [{ userId: "wxid_alice", text: "assistant content" }]);
});

test("weixin turn display hides reasoning events from chat output", async () => {
  const messages: Array<{ userId: string; text: string }> = [];

  const display = new WeixinTurnDisplay({
    userId: "wxid_alice",
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ userId: target.userId, text });
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

test("weixin turn display emits onAssistantText once and does not replay it at onAssistantDone", async () => {
  const messages: Array<{ userId: string; text: string }> = [];

  const display = new WeixinTurnDisplay({
    userId: "wxid_alice",
    sendTyping: async () => {
      return;
    },
    enqueueVisibleMessage: async (target, text) => {
      messages.push({ userId: target.userId, text });
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

  assert.deepEqual(messages, [{ userId: "wxid_alice", text: "assistant-text" }]);
});

test("weixin turn display surfaces durable enqueue failures instead of swallowing them", async () => {
  const display = new WeixinTurnDisplay({
    userId: "wxid_alice",
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

test("weixin delivery queue routes text, image, video, and file sends through the current context token", async (t) => {
  const root = await createTempWorkspace("weixin-delivery-kinds", t);
  const queuePath = path.join(root, "delivery.json");
  const tokenStore = new FileWeixinContextTokenStore(path.join(root, "context-token.json"));
  const imagePath = path.join(root, "photo.png");
  const videoPath = path.join(root, "clip.mp4");
  const filePath = path.join(root, "brief.pdf");
  await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(videoPath, Buffer.from("video"));
  await fs.writeFile(filePath, Buffer.from("file"));
  await tokenStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-001",
    status: "active",
    updatedAt: "2026-04-07T00:00:00.000Z",
  });

  const sent: string[] = [];
  const target: WeixinDeliveryTarget = {
    async sendText(request) {
      sent.push(`text:${request.userId}:${request.contextToken}:${request.clientId}:${request.text}`);
    },
    async sendImage(request) {
      sent.push(`image:${request.userId}:${request.contextToken}:${path.basename(request.filePath)}`);
    },
    async sendVideo(request) {
      sent.push(`video:${request.userId}:${request.contextToken}:${path.basename(request.filePath)}`);
    },
    async sendFile(request) {
      sent.push(`file:${request.userId}:${request.contextToken}:${path.basename(request.filePath)}`);
    },
  };

  const queue = new WeixinDeliveryQueue({
    storePath: queuePath,
    target,
    contextTokenStore: tokenStore,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      receiptTimeoutMs: 250,
    },
  });

  await queue.enqueueText({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    text: "queued text",
  });
  await queue.enqueueImage({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    filePath: imagePath,
    caption: "image ready",
  });
  await queue.enqueueVideo({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    filePath: videoPath,
    caption: "video ready",
  });
  await queue.enqueueFile({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    filePath,
    fileName: "brief.pdf",
    caption: "file ready",
  });

  await queue.flushDue();

  assert.deepEqual(await queue.listPending(), []);
  assert.match(sent[0] ?? "", /^text:wxid_alice:ctx-001:athlete-weixin:.*:queued text$/);
  assert.deepEqual(sent.slice(1), [
    "image:wxid_alice:ctx-001:photo.png",
    "video:wxid_alice:ctx-001:clip.mp4",
    "file:wxid_alice:ctx-001:brief.pdf",
  ]);
});

test("weixin delivery queue keeps pending entries when the context token is missing and resumes after refresh", async (t) => {
  const root = await createTempWorkspace("weixin-delivery-token-refresh", t);
  const queuePath = path.join(root, "delivery.json");
  const tokenStore = new FileWeixinContextTokenStore(path.join(root, "context-token.json"));
  const sent: string[] = [];

  const target: WeixinDeliveryTarget = {
    async sendText(request) {
      sent.push(request.text);
    },
    async sendImage() {
      throw new Error("unexpected image send");
    },
    async sendVideo() {
      throw new Error("unexpected video send");
    },
    async sendFile() {
      throw new Error("unexpected file send");
    },
  };

  const queue = new WeixinDeliveryQueue({
    storePath: queuePath,
    target,
    contextTokenStore: tokenStore,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      receiptTimeoutMs: 5_000,
    },
  });

  await queue.enqueueText({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    text: "pending until next inbound token",
  });
  await queue.flushDue();

  let pending = await queue.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.attemptCount, 0);
  assert.equal(pending[0]?.blockedReason, "missing_context_token");
  assert.deepEqual(sent, []);

  await tokenStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-002",
    status: "active",
    updatedAt: "2026-04-07T00:05:00.000Z",
  });

  const restored = new WeixinDeliveryQueue({
    storePath: queuePath,
    target,
    contextTokenStore: tokenStore,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      receiptTimeoutMs: 5_000,
    },
  });

  await restored.flushDue();
  pending = await restored.listPending();
  assert.deepEqual(pending, []);
  assert.deepEqual(sent, ["pending until next inbound token"]);
});

test("weixin delivery queue marks invalid context tokens fail-closed and resumes only after a new token is stored", async (t) => {
  const root = await createTempWorkspace("weixin-delivery-invalid-token", t);
  const queuePath = path.join(root, "delivery.json");
  const tokenStore = new FileWeixinContextTokenStore(path.join(root, "context-token.json"));
  const sent: string[] = [];
  let rejectCurrentToken = true;

  await tokenStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-stale",
    status: "active",
    updatedAt: "2026-04-07T00:00:00.000Z",
  });

  const target: WeixinDeliveryTarget = {
    async sendText(request) {
      if (rejectCurrentToken) {
        throw new WeixinContextTokenDeliveryError(`context token rejected: ${request.contextToken}`);
      }
      sent.push(`${request.contextToken}:${request.text}`);
    },
    async sendImage() {
      throw new Error("unexpected image send");
    },
    async sendVideo() {
      throw new Error("unexpected video send");
    },
    async sendFile() {
      throw new Error("unexpected file send");
    },
  };

  const queue = new WeixinDeliveryQueue({
    storePath: queuePath,
    target,
    contextTokenStore: tokenStore,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      receiptTimeoutMs: 5_000,
    },
  });

  await queue.enqueueText({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    text: "wait for fresh token",
  });
  await queue.flushDue();

  let pending = await queue.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.attemptCount, 0);
  assert.equal(pending[0]?.blockedReason, "context_token_invalid");
  assert.equal(await tokenStore.getUsableToken("weixin:private:wxid_alice"), null);
  assert.deepEqual(sent, []);

  rejectCurrentToken = false;
  await tokenStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-fresh",
    status: "active",
    updatedAt: "2026-04-07T00:10:00.000Z",
  });
  await queue.flushDue();

  pending = await queue.listPending();
  assert.deepEqual(pending, []);
  assert.deepEqual(sent, ["ctx-fresh:wait for fresh token"]);
});
