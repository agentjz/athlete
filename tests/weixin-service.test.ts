import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../src/agent/session.js";
import { WeixinDeliveryQueue } from "../src/weixin/deliveryQueue.js";
import { FileWeixinContextTokenStore } from "../src/weixin/contextTokenStore.js";
import type { WeixinClientLike } from "../src/weixin/client.js";
import { FileWeixinSessionMapStore } from "../src/weixin/sessionMapStore.js";
import { WeixinService } from "../src/weixin/service.js";
import { FileWeixinSyncBufStore } from "../src/weixin/syncBufStore.js";
import type { WeixinPollingBatch, WeixinPollingSourceLike, WeixinRawMessage } from "../src/weixin/types.js";
import { createAbortError } from "../src/utils/abort.js";
import { createTestRuntimeConfig, createTempWorkspace } from "./helpers.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeWeixinClient implements WeixinClientLike {
  public readonly sentTexts: Array<{ userId: string; contextToken: string; text: string; clientId: string }> = [];
  public readonly sentFiles: Array<{ userId: string; contextToken: string; filePath: string; fileName?: string; caption?: string }> = [];
  public readonly typingCalls: Array<{ userId: string; typingTicket: string; status: number }> = [];
  public readonly configRequests: Array<{ userId: string; contextToken: string }> = [];

  async loginWithQr(): Promise<never> {
    throw new Error("not implemented");
  }

  async getUpdates(): Promise<never> {
    throw new Error("not implemented");
  }

  async getTypingConfig(userId: string, contextToken: string): Promise<{ typingTicket: string | null }> {
    this.configRequests.push({ userId, contextToken });
    return {
      typingTicket: "typing-ticket-001",
    };
  }

  async sendTyping(userId: string, typingTicket: string, status: number): Promise<void> {
    this.typingCalls.push({ userId, typingTicket, status });
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

  async sendFile(request: { userId: string; contextToken: string; filePath: string; fileName?: string; caption?: string }): Promise<void> {
    this.sentFiles.push(request);
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
    allowedUserIds: ["wxid_alice", "wxid_bob"],
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

function createPollingSource(batches: WeixinPollingBatch[]): WeixinPollingSourceLike {
  const commits: string[] = [];

  return {
    async poll(): Promise<WeixinPollingBatch> {
      return batches.shift() ?? {
        messages: [],
        syncBuf: null,
      };
    },
    async commit(syncBuf: string | null): Promise<void> {
      if (syncBuf) {
        commits.push(syncBuf);
      }
    },
    get commits() {
      return commits;
    },
  } as WeixinPollingSourceLike & {
    commits: string[];
  };
}

function createTextMessage(
  seq: number,
  text: string,
  overrides: {
    userId?: string;
    contextToken?: string;
  } = {},
): WeixinRawMessage {
  return {
    seq,
    message_id: seq,
    from_user_id: overrides.userId ?? "wxid_alice",
    to_user_id: "athlete-bot",
    create_time_ms: 0,
    message_type: 1,
    context_token: overrides.contextToken ?? `ctx-${seq}`,
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


async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1_500;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  assert.fail(`Condition not met within ${timeoutMs}ms`);
}

test("weixin service runs private inbound messages through the Athlete runtime and replies through delivery", async (t) => {
  const root = await createTempWorkspace("weixin-service-main", t);
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
  const seenInputs: string[] = [];
  const pollingSource = createPollingSource([
    {
      messages: [createTextMessage(10, "ship it")],
      syncBuf: "sync-buf-010",
    },
  ]);

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
    pollingSource,
    runTurn: async (options) => {
      seenInputs.push(options.input);
      options.callbacks?.onAssistantText?.("done");
      options.callbacks?.onAssistantDone?.("done");
      return {
        session: await options.sessionStore.save({
          ...options.session,
          title: "weixin-session",
        }),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await service.runOnce();
  await service.waitForIdle();

  assert.deepEqual(seenInputs, ["ship it"]);
  assert.equal(client.configRequests.length > 0, true);
  assert.equal(client.typingCalls.length > 0, true);
  assert.equal(client.sentTexts.some((entry) => entry.text === "done"), true);
  assert.equal(await syncBufStore.load(), "sync-buf-010");
  const binding = await sessionMapStore.get("weixin:private:wxid_alice");
  assert.equal((binding?.sessionId ?? "").length > 0, true);
  assert.equal(await contextTokenStore.getUsableToken("weixin:private:wxid_alice"), "ctx-10");
});

test("weixin service keeps help and session commands but blocks quit reset and multiline terminal semantics", async (t) => {
  const root = await createTempWorkspace("weixin-command-semantics", t);
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
  const pollingSource = createPollingSource([
    {
      messages: [
        createTextMessage(20, "/help"),
        createTextMessage(21, "quit"),
        createTextMessage(22, "/reset"),
        createTextMessage(23, "/multi"),
      ],
      syncBuf: "sync-buf-023",
    },
  ]);
  let runTurnCount = 0;

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
    pollingSource,
    runTurn: async (options) => {
      runTurnCount += 1;
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

  const combined = client.sentTexts.map((entry) => entry.text).join("\n");
  assert.equal(runTurnCount, 0);
  assert.match(combined, /\/stop/i);
  assert.doesNotMatch(combined, /\bquit\b/i);
  assert.doesNotMatch(combined, /\breset\b/i);
  assert.match(combined, /interactive multiline mode/i);
  assert.equal(await sessionMapStore.get("weixin:private:wxid_alice") !== null, true);
});

test("weixin /stop aborts only the current peer while other peers continue and the service stays online", async (t) => {
  const root = await createTempWorkspace("weixin-stop", t);
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
  const pollingSource = {
    commits: [] as string[],
    batches: [
      {
        messages: [
          createTextMessage(100, "long running task", { userId: "wxid_alice", contextToken: "ctx-a-1" }),
          createTextMessage(101, "independent peer", { userId: "wxid_bob", contextToken: "ctx-b-1" }),
        ],
        syncBuf: "sync-a",
      },
      {
        messages: [createTextMessage(102, "/stop", { userId: "wxid_alice", contextToken: "ctx-a-2" })],
        syncBuf: "sync-b",
      },
      {
        messages: [createTextMessage(103, "post-stop follow-up", { userId: "wxid_alice", contextToken: "ctx-a-3" })],
        syncBuf: "sync-c",
      },
    ] as WeixinPollingBatch[],
    async poll(): Promise<WeixinPollingBatch> {
      if (this.batches.length > 0) {
        return this.batches.shift() ?? { messages: [], syncBuf: null };
      }
      await delay(10);
      return {
        messages: [],
        syncBuf: null,
      };
    },
    async commit(syncBuf: string | null): Promise<void> {
      if (syncBuf) {
        this.commits.push(syncBuf);
      }
    },
  };
  let longTaskAborted = false;
  let followUpProcessed = false;
  let otherPeerProcessed = false;

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
    pollingSource: pollingSource as never,
    sleep: async () => {
      await delay(5);
    },
    runTurn: async (options) => {
      if (options.input === "long running task") {
        return new Promise((resolve, reject) => {
          options.abortSignal?.addEventListener(
            "abort",
            () => {
              longTaskAborted = true;
              reject(createAbortError("weixin stop"));
            },
            { once: true },
          );
        });
      }

      if (options.input === "independent peer") {
        otherPeerProcessed = true;
        options.callbacks?.onAssistantText?.("peer2 ok");
        options.callbacks?.onAssistantDone?.("peer2 ok");
      }

      if (options.input === "post-stop follow-up") {
        followUpProcessed = true;
        options.callbacks?.onAssistantText?.("peer1 recovered");
        options.callbacks?.onAssistantDone?.("peer1 recovered");
      }

      return {
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const controller = new AbortController();
  const runPromise = service.run(controller.signal);

  try {
    await waitFor(() => longTaskAborted && otherPeerProcessed && followUpProcessed, {
      timeoutMs: 2_500,
    });
  } finally {
    controller.abort();
    service.stop();
    await runPromise;
  }

  const transcript = client.sentTexts.map((entry) => `${entry.userId}:${entry.text}`).join("\n");
  assert.equal(longTaskAborted, true);
  assert.equal(otherPeerProcessed, true);
  assert.equal(followUpProcessed, true);
  assert.match(transcript, /wxid_alice:.*stop|stopped|interrupted/i);
  assert.match(transcript, /wxid_bob:peer2 ok/);
  assert.match(transcript, /wxid_alice:peer1 recovered/);
});

test("weixin service retries pending deliveries after the next inbound token refresh instead of dropping them on restart", async (t) => {
  const root = await createTempWorkspace("weixin-token-refresh-service", t);
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
  const pollingSource = createPollingSource([
    {
      messages: [createTextMessage(30, "fresh inbound after restart", { contextToken: "ctx-fresh" })],
      syncBuf: "sync-buf-030",
    },
  ]);

  await deliveryQueue.enqueueText({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    text: "pending before restart",
  });
  await deliveryQueue.flushDue();
  assert.deepEqual(client.sentTexts, []);

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
    pollingSource,
    runTurn: async (options) => {
      options.callbacks?.onAssistantText?.("new reply");
      options.callbacks?.onAssistantDone?.("new reply");
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
  await waitFor(() => client.sentTexts.length >= 2);

  assert.deepEqual(
    client.sentTexts.map((entry: { text: string }) => entry.text),
    ["pending before restart", "new reply"],
  );
  assert.deepEqual(await deliveryQueue.listPending(), []);
});

test("weixin service sends long visible replies as txt files instead of fragile long chat messages", async (t) => {
  const root = await createTempWorkspace("weixin-long-visible-file", t);
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
  const pollingSource = createPollingSource([
    {
      messages: [createTextMessage(50, "long reply please")],
      syncBuf: "sync-buf-050",
    },
  ]);
  const longReply = "LONG_VISIBLE_REPLY::" + "X".repeat(6_000);

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
    pollingSource,
    runTurn: async (options) => {
      options.callbacks?.onAssistantDone?.(longReply);
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

  assert.equal(client.sentTexts.length, 0);
  assert.equal(client.sentFiles.length, 1);
  assert.match(client.sentFiles[0]!.fileName ?? "", /^athlete-reply-.*\.txt$/);
});
