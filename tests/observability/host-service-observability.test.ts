import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import type { TelegramBotApiClient, TelegramSendMessageRequest } from "../../src/telegram/botApiClient.js";
import type { TelegramRuntimeConfig } from "../../src/telegram/config.js";
import { TelegramDeliveryQueue } from "../../src/telegram/deliveryQueue.js";
import { FileTelegramOffsetStore } from "../../src/telegram/offsetStore.js";
import { FileTelegramSessionMapStore } from "../../src/telegram/sessionMapStore.js";
import { TelegramService } from "../../src/telegram/service.js";
import type { TelegramUpdate } from "../../src/telegram/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import { readObservabilityEvents } from "../observability.helpers.js";

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
    stateDir: path.join(root, ".deadmouse", "telegram"),
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
