import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { TelegramDeliveryQueue } from "../../src/telegram/deliveryQueue.js";
import { FileTelegramOffsetStore } from "../../src/telegram/offsetStore.js";
import { FileTelegramSessionMapStore } from "../../src/telegram/sessionMapStore.js";
import { TelegramService } from "../../src/telegram/service.js";
import type {
  TelegramBotApiClient,
  TelegramSendMessageRequest,
} from "../../src/telegram/botApiClient.js";
import type { TelegramRuntimeConfig } from "../../src/telegram/config.js";
import type { TelegramUpdate } from "../../src/telegram/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

class FakeTelegramBotApiClient implements TelegramBotApiClient {
  public readonly seenOffsets: number[] = [];
  public readonly sentMessages: TelegramSendMessageRequest[] = [];
  public readonly sentActions: Array<{ chatId: number; action: "typing" }> = [];
  public readonly sentDocuments: Array<{ chatId: number; filePath: string; fileName?: string; caption?: string }> = [];
  public readonly editedMessages: Array<{ chatId: number; messageId: number; text: string }> = [];
  public readonly deletedMessages: Array<{ chatId: number; messageId: number }> = [];

  constructor(private readonly batches: TelegramUpdate[][] = []) {}

  async getUpdates(request: { offset?: number; limit: number; timeoutSeconds: number }): Promise<TelegramUpdate[]> {
    this.seenOffsets.push(request.offset ?? 0);
    return this.batches.shift() ?? [];
  }

  async sendMessage(request: TelegramSendMessageRequest): Promise<{ messageId: number; chatId: number }> {
    this.sentMessages.push(request);
    return {
      messageId: this.sentMessages.length,
      chatId: request.chatId,
    };
  }

  async sendChatAction(request: { chatId: number; action: "typing" }): Promise<void> {
    this.sentActions.push(request);
  }

  async editMessageText(request: { chatId: number; messageId: number; text: string }): Promise<void> {
    this.editedMessages.push(request);
  }

  async deleteMessage(request: { chatId: number; messageId: number }): Promise<void> {
    this.deletedMessages.push(request);
  }

  async sendDocument(request: { chatId: number; filePath: string; fileName?: string; caption?: string }): Promise<void> {
    this.sentDocuments.push(request);
  }

  async getFile(): Promise<{ filePath: string; fileSize?: number }> {
    throw new Error("not implemented in this test");
  }

  async downloadFile(): Promise<Buffer> {
    throw new Error("not implemented in this test");
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

function createPrivateUpdate(
  updateId: number,
  text: string,
  overrides: {
    userId?: number;
    chatId?: number;
    chatType?: "private" | "group" | "supergroup" | "channel";
  } = {},
): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      text,
      from: {
        id: overrides.userId ?? 1001,
        is_bot: false,
        first_name: "Tester",
      },
      chat: {
        id: overrides.chatId ?? 5001,
        type: overrides.chatType ?? "private",
      },
    },
  };
}

test("telegram service runs private inbound messages through the Deadmouse turn/session runtime and replies through delivery", async (t) => {
  const root = await createTempWorkspace("telegram-service-main", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FakeTelegramBotApiClient([[createPrivateUpdate(10, "ship it")]]);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });
  const seenInputs: string[] = [];

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
      seenInputs.push(options.input);
      options.callbacks?.onStatus?.("working");
      options.callbacks?.onAssistantDelta?.("done");
      options.callbacks?.onAssistantText?.("done");
      options.callbacks?.onAssistantDone?.("done");
      return {
        session: await options.sessionStore.save({
          ...options.session,
          title: "telegram-session",
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
  assert.equal(bot.sentActions.length > 0, true);
  assert.equal(bot.sentMessages.some((entry) => entry.text === "done"), true);
  assert.equal(await offsetStore.load(), 11);
  const mainBinding = await sessionMapStore.get("telegram:private:5001");
  assert.equal((mainBinding?.sessionId ?? "").length > 0, true);
});

test("telegram service reuses local commands for private chats and does not route unsupported chats into the runtime", async (t) => {
  const root = await createTempWorkspace("telegram-service-local-commands", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FakeTelegramBotApiClient([[
    createPrivateUpdate(20, "/session"),
    createPrivateUpdate(21, "group should be ignored", {
      chatType: "group",
    }),
  ]]);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });
  let runTurnCount = 0;

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
      runTurnCount += 1;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await service.runOnce();
  await service.waitForIdle();

  assert.equal(runTurnCount, 0);
  assert.equal(bot.sentMessages.length, 1);
  assert.match(bot.sentMessages[0]!.text, /Current session:/);
  assert.equal(await offsetStore.load(), 22);
});

test("telegram service restores offset and peer-to-session mapping across restarts", async (t) => {
  const root = await createTempWorkspace("telegram-service-restart", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const firstBot = new FakeTelegramBotApiClient([[createPrivateUpdate(30, "first turn")]]);
  const firstDeliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: firstBot,
    deliveryConfig: telegram.delivery,
  });

  const firstService = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: firstBot,
    sessionStore,
    sessionMapStore,
    offsetStore,
    deliveryQueue: firstDeliveryQueue,
    runTurn: async (options) => {
      options.callbacks?.onAssistantText?.("first reply");
      options.callbacks?.onAssistantDone?.("first reply");
      return {
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await firstService.runOnce();
  await firstService.waitForIdle();

  const firstBinding = await sessionMapStore.get("telegram:private:5001");
  assert.equal((firstBinding?.sessionId ?? "").length > 0, true);
  assert.equal(await offsetStore.load(), 31);

  const secondBot = new FakeTelegramBotApiClient([[createPrivateUpdate(31, "/session")]]);
  const secondService = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: secondBot,
    sessionStore,
    sessionMapStore: new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json")),
    offsetStore: new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json")),
    deliveryQueue: new TelegramDeliveryQueue({
      storePath: path.join(telegram.stateDir, "delivery.json"),
      target: secondBot,
      deliveryConfig: telegram.delivery,
    }),
  });

  await secondService.runOnce();
  await secondService.waitForIdle();

  assert.deepEqual(secondBot.seenOffsets, [31]);
  assert.equal(secondBot.sentMessages.length, 1);
  assert.match(secondBot.sentMessages[0]!.text, new RegExp(firstBinding?.sessionId ?? ""));
});

test("telegram service logs why ignored updates are dropped instead of failing silently", async (t) => {
  const root = await createTempWorkspace("telegram-service-ignored-updates", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FakeTelegramBotApiClient([[
    createPrivateUpdate(40, "group message should be ignored", {
      chatType: "group",
    }),
    createPrivateUpdate(41, "unauthorized private message", {
      userId: 9999,
    }),
  ]]);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });
  const infoLogs: Array<{ event: string; detail?: string }> = [];
  let runTurnCount = 0;

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
    logger: {
      info(event, context) {
        infoLogs.push({
          event,
          detail: context?.detail,
        });
      },
      error() {
        return;
      },
    },
    runTurn: async (options) => {
      runTurnCount += 1;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await service.runOnce();
  await service.waitForIdle();

  assert.equal(runTurnCount, 0);
  assert.equal(bot.sentMessages.length, 0);
  assert.equal(await offsetStore.load(), 42);
  assert.equal(
    infoLogs.some(
      (entry) =>
        entry.event === "ignored inbound update" &&
        /reason=non_private_chat/i.test(entry.detail ?? "") &&
        /private chat/i.test(entry.detail ?? ""),
    ),
    true,
  );
  assert.equal(
    infoLogs.some(
      (entry) =>
        entry.event === "ignored inbound update" &&
        /reason=unauthorized_user/i.test(entry.detail ?? "") &&
        /DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS/i.test(entry.detail ?? ""),
    ),
    true,
  );
});
