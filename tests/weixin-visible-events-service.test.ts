import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../src/agent/session.js";
import { FileWeixinContextTokenStore } from "../src/weixin/contextTokenStore.js";
import { WeixinDeliveryQueue } from "../src/weixin/deliveryQueue.js";
import type { WeixinClientLike } from "../src/weixin/client.js";
import { FileWeixinSessionMapStore } from "../src/weixin/sessionMapStore.js";
import { WeixinService } from "../src/weixin/service.js";
import { FileWeixinSyncBufStore } from "../src/weixin/syncBufStore.js";
import type { WeixinPollingBatch, WeixinPollingSourceLike, WeixinRawMessage } from "../src/weixin/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "./helpers.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 1_500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await delay(10);
  }

  assert.fail(`Condition not met within ${timeoutMs}ms`);
}

class FakeWeixinClient implements WeixinClientLike {
  public readonly sentTexts: Array<{ userId: string; contextToken: string; text: string; clientId: string }> = [];

  async loginWithQr(): Promise<never> {
    throw new Error("not implemented");
  }

  async getUpdates(): Promise<never> {
    throw new Error("not implemented");
  }

  async getTypingConfig(): Promise<{ typingTicket: string | null }> {
    return {
      typingTicket: "typing-ticket-001",
    };
  }

  async sendTyping(): Promise<void> {
    return;
  }

  async sendText(request: { userId: string; contextToken: string; text: string; clientId: string }): Promise<void> {
    this.sentTexts.push(request);
  }

  async sendImage(): Promise<never> {
    throw new Error("not implemented");
  }

  async sendVideo(): Promise<never> {
    throw new Error("not implemented");
  }

  async sendFile(): Promise<never> {
    throw new Error("not implemented");
  }

  async downloadMedia(): Promise<never> {
    throw new Error("not implemented");
  }

  async downloadVoice(): Promise<never> {
    throw new Error("not implemented");
  }
}

function createWeixinConfig(root: string): Record<string, unknown> {
  return {
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    allowedUserIds: ["wxid_alice"],
    polling: {
      timeoutMs: 1_000,
      retryBackoffMs: 5,
    },
    delivery: {
      maxRetries: 4,
      baseDelayMs: 25,
      maxDelayMs: 250,
      receiptTimeoutMs: 5_000,
    },
    messageChunkChars: 256,
    typingIntervalMs: 50,
    qrTimeoutMs: 120_000,
    routeTag: "",
    stateDir: path.join(root, ".athlete", "weixin"),
    credentialsFile: path.join(root, ".athlete", "weixin", "credentials.json"),
    syncBufFile: path.join(root, ".athlete", "weixin", "sync-buf.json"),
    credentials: {
      token: "bot-token-123",
      baseUrl: "https://ilinkai.weixin.qq.com",
      cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
      botId: "bot-001",
      userId: "athlete-bot",
      connectedAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
    },
  };
}

function createPollingSource(batch: WeixinPollingBatch) {
  const commits: string[] = [];

  return {
    async poll(): Promise<WeixinPollingBatch> {
      return batch;
    },
    async commit(syncBuf: string | null): Promise<void> {
      if (syncBuf) {
        commits.push(syncBuf);
      }
    },
    commits,
  } as WeixinPollingSourceLike & {
    commits: string[];
  };
}

function createTextMessage(seq: number, text: string): WeixinRawMessage {
  return {
    seq,
    message_id: seq,
    from_user_id: "wxid_alice",
    to_user_id: "athlete-bot",
    create_time_ms: 0,
    message_type: 1,
    context_token: `ctx-${seq}`,
    item_list: [
      {
        type: 1,
        text_item: {
          text,
        },
      },
    ],
  };
}

function createAttachmentStore() {
  return {
    async listByPeer() {
      return [];
    },
    async add() {
      return;
    },
  };
}

test("weixin service only sends the final assistant reply to chat output", async (t) => {
  const root = await createTempWorkspace("weixin-visible-events-order", t);
  const runtime = createTestRuntimeConfig(root);
  const weixin = createWeixinConfig(root);
  const client = new FakeWeixinClient();
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileWeixinSessionMapStore(path.join(String(weixin.stateDir), "session-map.json"));
  const syncBufStore = new FileWeixinSyncBufStore(path.join(String(weixin.stateDir), "sync-buf.json"));
  const contextTokenStore = new FileWeixinContextTokenStore(path.join(String(weixin.stateDir), "context-token.json"));
  const deliveryQueue = new WeixinDeliveryQueue({
    storePath: path.join(String(weixin.stateDir), "delivery.json"),
    target: client,
    contextTokenStore,
    deliveryConfig: (weixin.delivery ?? {}) as never,
  });
  const pollingSource = createPollingSource({
    messages: [createTextMessage(10, "mirror visible events")],
    syncBuf: "sync-buf-010",
  });

  const service = new WeixinService({
    cwd: root,
    config: {
      ...runtime,
      weixin,
    } as never,
    client,
    sessionStore,
    sessionMapStore,
    syncBufStore,
    contextTokenStore,
    deliveryQueue,
    attachmentStore: createAttachmentStore() as never,
    pollingSource,
    runTurn: async (options) => {
      options.callbacks?.onReasoningDelta?.("reasoning-1");
      options.callbacks?.onReasoningDelta?.("reasoning-2");
      options.callbacks?.onToolCall?.("search_files", "{}");
      options.callbacks?.onToolCall?.("search_files", "{}");
      options.callbacks?.onToolResult?.("todo_write", JSON.stringify({ preview: "[ ] #1: same todo preview" }));
      options.callbacks?.onToolResult?.("todo_write", JSON.stringify({ preview: "[ ] #1: same todo preview" }));
      options.callbacks?.onAssistantDelta?.("assistant");
      options.callbacks?.onAssistantDelta?.(" content");
      options.callbacks?.onAssistantDone?.("assistant content");
      return {
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await service.runOnce();
  await service.waitForIdle();

  assert.deepEqual(
    client.sentTexts.map((entry) => entry.text),
    ["assistant content"],
  );
});

test("weixin service does not commit sync_buf before visible events are durably enqueued", async (t) => {
  const root = await createTempWorkspace("weixin-visible-events-commit", t);
  const runtime = createTestRuntimeConfig(root);
  const weixin = createWeixinConfig(root);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileWeixinSessionMapStore(path.join(String(weixin.stateDir), "session-map.json"));
  const syncBufStore = new FileWeixinSyncBufStore(path.join(String(weixin.stateDir), "sync-buf.json"));
  const contextTokenStore = new FileWeixinContextTokenStore(path.join(String(weixin.stateDir), "context-token.json"));
  const pollingSource = createPollingSource({
    messages: [createTextMessage(11, "wait for durable visible event")],
    syncBuf: "sync-buf-011",
  });
  let enqueueStarted = false;
  let resolveEnqueue!: () => void;
  const enqueueGate = new Promise<void>((resolve) => {
    resolveEnqueue = resolve;
  });

  const service = new WeixinService({
    cwd: root,
    config: {
      ...runtime,
      weixin,
    } as never,
    client: new FakeWeixinClient(),
    sessionStore,
    sessionMapStore,
    syncBufStore,
    contextTokenStore,
    attachmentStore: createAttachmentStore() as never,
    deliveryQueue: {
      async flushDue() {
        return;
      },
      async enqueueText() {
        enqueueStarted = true;
        await enqueueGate;
        return {} as never;
      },
    } as unknown as WeixinDeliveryQueue,
    pollingSource,
    runTurn: async (options) => {
      options.callbacks?.onAssistantText?.("assistant-text");
      return {
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const runOncePromise = service.runOnce();
  await waitFor(() => enqueueStarted);
  assert.deepEqual(pollingSource.commits, []);

  resolveEnqueue();
  await runOncePromise;

  assert.deepEqual(pollingSource.commits, ["sync-buf-011"]);
});

test("weixin service does not swallow visible enqueue failures or commit sync_buf early", async (t) => {
  const root = await createTempWorkspace("weixin-visible-events-failure", t);
  const runtime = createTestRuntimeConfig(root);
  const weixin = createWeixinConfig(root);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileWeixinSessionMapStore(path.join(String(weixin.stateDir), "session-map.json"));
  const syncBufStore = new FileWeixinSyncBufStore(path.join(String(weixin.stateDir), "sync-buf.json"));
  const contextTokenStore = new FileWeixinContextTokenStore(path.join(String(weixin.stateDir), "context-token.json"));
  const pollingSource = createPollingSource({
    messages: [createTextMessage(12, "fail visible enqueue")],
    syncBuf: "sync-buf-012",
  });
  let enqueueStarted = false;

  const service = new WeixinService({
    cwd: root,
    config: {
      ...runtime,
      weixin,
    } as never,
    client: new FakeWeixinClient(),
    sessionStore,
    sessionMapStore,
    syncBufStore,
    contextTokenStore,
    attachmentStore: createAttachmentStore() as never,
    deliveryQueue: {
      async flushDue() {
        return;
      },
      async enqueueText() {
        enqueueStarted = true;
        throw new Error("durable enqueue failed");
      },
    } as unknown as WeixinDeliveryQueue,
    pollingSource,
    runTurn: async (options) => {
      options.callbacks?.onAssistantText?.("assistant-text");
      return {
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const runOncePromise = service.runOnce();
  const rejection = assert.rejects(runOncePromise, /durable enqueue failed/);
  await waitFor(() => enqueueStarted);
  await rejection;
  await service.waitForIdle();
  assert.deepEqual(pollingSource.commits, []);
  assert.equal(await syncBufStore.load(), null);
});
