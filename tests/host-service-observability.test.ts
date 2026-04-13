import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../src/agent/session.js";
import { TelegramDeliveryQueue } from "../src/telegram/deliveryQueue.js";
import { FileTelegramOffsetStore } from "../src/telegram/offsetStore.js";
import { FileTelegramSessionMapStore } from "../src/telegram/sessionMapStore.js";
import { TelegramService } from "../src/telegram/service.js";
import type { TelegramBotApiClient, TelegramSendMessageRequest } from "../src/telegram/botApiClient.js";
import type { TelegramRuntimeConfig } from "../src/telegram/config.js";
import type { TelegramUpdate } from "../src/telegram/types.js";
import { FileWeixinContextTokenStore } from "../src/weixin/contextTokenStore.js";
import { WeixinDeliveryQueue } from "../src/weixin/deliveryQueue.js";
import type { WeixinClientLike } from "../src/weixin/client.js";
import { FileWeixinSessionMapStore } from "../src/weixin/sessionMapStore.js";
import { WeixinService } from "../src/weixin/service.js";
import { FileWeixinSyncBufStore } from "../src/weixin/syncBufStore.js";
import type { WeixinPollingBatch, WeixinPollingSourceLike, WeixinRawMessage } from "../src/weixin/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "./helpers.js";
import { readObservabilityEvents } from "./observability.helpers.js";

test("telegram service observability records inbound accepted turn started reply queued and delivery failure", async (t) => {
  const root = await createTempWorkspace("telegram-host-observability", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FailingTelegramBotApiClient([[createPrivateUpdate(10, "ship it")]]);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });

  const service = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot,
    sessionStore,
    sessionMapStore,
    offsetStore,
    deliveryQueue,
    runTurn: async (options) => {
      options.callbacks?.onAssistantText?.("reply that will fail delivery");
      options.callbacks?.onAssistantDone?.("reply that will fail delivery");
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

  const events = await readObservabilityEvents(root);
  const hostMessageEvents = events.filter((event) => event.event === "host.message");
  const hostTurnEvents = events.filter((event) => event.event === "host.turn");

  assert.equal(hostMessageEvents.some((event) =>
    event.status === "accepted" &&
    event.host === "telegram" &&
    (event.details as Record<string, unknown>)?.direction === "inbound"
  ), true);
  assert.equal(hostTurnEvents.some((event) =>
    event.status === "started" &&
    event.host === "telegram"
  ), true);
  assert.equal(hostMessageEvents.some((event) =>
    event.status === "queued" &&
    event.host === "telegram" &&
    (event.details as Record<string, unknown>)?.deliveryKind === "text"
  ), true);
  assert.equal(hostMessageEvents.some((event) =>
    event.status === "failed" &&
    event.host === "telegram" &&
    /telegram send failed/i.test(String((event.error as { message?: unknown })?.message ?? ""))
  ), true);
});

test("weixin service observability records inbound accepted turn started and file replies queued", async (t) => {
  const root = await createTempWorkspace("weixin-host-observability", t);
  const runtime = createTestRuntimeConfig(root);
  const weixin = createWeixinConfig(root);
  const client = new RecordingWeixinClient();
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
  const pollingSource = createPollingSource([{
    messages: [createTextMessage(20, "long reply please")],
    syncBuf: "sync-020",
  }]);

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
      options.callbacks?.onAssistantDone?.("LONG_REPLY::" + "X".repeat(6_000));
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

  const events = await readObservabilityEvents(root);
  const hostMessageEvents = events.filter((event) => event.event === "host.message");
  const hostTurnEvents = events.filter((event) => event.event === "host.turn");

  assert.equal(hostMessageEvents.some((event) =>
    event.status === "accepted" &&
    event.host === "weixin" &&
    (event.details as Record<string, unknown>)?.direction === "inbound"
  ), true);
  assert.equal(hostTurnEvents.some((event) =>
    event.status === "started" &&
    event.host === "weixin"
  ), true);
  assert.equal(hostMessageEvents.some((event) =>
    event.status === "queued" &&
    event.host === "weixin" &&
    (event.details as Record<string, unknown>)?.deliveryKind === "file"
  ), true);
});

class FailingTelegramBotApiClient implements TelegramBotApiClient {
  public readonly sentMessages: TelegramSendMessageRequest[] = [];

  constructor(private readonly batches: TelegramUpdate[][]) {}

  async getUpdates(): Promise<TelegramUpdate[]> {
    return this.batches.shift() ?? [];
  }

  async sendMessage(request: TelegramSendMessageRequest): Promise<{ messageId: number; chatId: number }> {
    this.sentMessages.push(request);
    throw new Error("telegram send failed");
  }

  async sendChatAction(): Promise<void> {}

  async editMessageText(): Promise<void> {}

  async deleteMessage(): Promise<void> {}

  async sendDocument(): Promise<void> {}

  async getFile(): Promise<{ filePath: string; fileSize?: number }> {
    throw new Error("not implemented");
  }

  async downloadFile(): Promise<Buffer> {
    throw new Error("not implemented");
  }
}

class RecordingWeixinClient implements WeixinClientLike {
  async loginWithQr(): Promise<never> {
    throw new Error("not implemented");
  }

  async getUpdates(): Promise<never> {
    throw new Error("not implemented");
  }

  async getTypingConfig(): Promise<{ typingTicket: string | null }> {
    return {
      typingTicket: "typing-ticket",
    };
  }

  async sendTyping(): Promise<void> {}

  async sendText(): Promise<void> {}

  async sendImage(): Promise<void> {}

  async sendVideo(): Promise<void> {}

  async sendFile(): Promise<void> {}

  async downloadMedia(): Promise<never> {
    throw new Error("not implemented");
  }

  async downloadVoice(): Promise<never> {
    throw new Error("not implemented");
  }
}

function createTelegramConfig(root: string, overrides: Partial<TelegramRuntimeConfig> = {}): TelegramRuntimeConfig {
  return {
    token: "123:abc",
    apiBaseUrl: "https://api.telegram.org",
    proxyUrl: "",
    allowedUserIds: [1001],
    polling: {
      timeoutSeconds: 10,
      limit: 10,
      retryBackoffMs: 1_000,
    },
    delivery: {
      maxRetries: 4,
      baseDelayMs: 250,
      maxDelayMs: 10_000,
    },
    messageChunkChars: 256,
    typingIntervalMs: 500,
    stateDir: path.join(root, ".athlete", "telegram"),
    ...overrides,
  };
}

function createPrivateUpdate(updateId: number, text: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      text,
      from: {
        id: 1001,
        is_bot: false,
        first_name: "Tester",
      },
      chat: {
        id: 5001,
        type: "private",
      },
    },
  };
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

function createPollingSource(batches: WeixinPollingBatch[]): WeixinPollingSourceLike {
  return {
    async poll(): Promise<WeixinPollingBatch> {
      return batches.shift() ?? {
        messages: [],
        syncBuf: null,
      };
    },
    async commit(): Promise<void> {},
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
    item_list: [{
      type: 1,
      text_item: {
        text,
      },
    }],
  };
}
