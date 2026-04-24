import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../src/agent/session.js";
import { TelegramDeliveryQueue } from "../src/telegram/deliveryQueue.js";
import { FileTelegramOffsetStore } from "../src/telegram/offsetStore.js";
import { FileTelegramSessionMapStore } from "../src/telegram/sessionMapStore.js";
import { TelegramService } from "../src/telegram/service.js";
import type { TelegramBotApiClient } from "../src/telegram/botApiClient.js";
import type { TelegramRuntimeConfig } from "../src/telegram/config.js";
import type { TelegramUpdate } from "../src/telegram/types.js";
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

class FakeTelegramBotApiClient implements TelegramBotApiClient {
  public readonly sentMessages: Array<{ chatId: number; text: string }> = [];

  async getUpdates(): Promise<TelegramUpdate[]> {
    throw new Error("not implemented");
  }

  async sendMessage(request: { chatId: number; text: string }): Promise<{ messageId: number; chatId: number }> {
    this.sentMessages.push(request);
    return {
      messageId: this.sentMessages.length,
      chatId: request.chatId,
    };
  }

  async sendChatAction(): Promise<void> {
    return;
  }

  async editMessageText(): Promise<void> {
    return;
  }

  async deleteMessage(): Promise<void> {
    return;
  }

  async sendDocument(): Promise<void> {
    throw new Error("not implemented");
  }

  async getFile(): Promise<{ filePath: string; fileSize?: number }> {
    throw new Error("not implemented");
  }

  async downloadFile(): Promise<Buffer> {
    throw new Error("not implemented");
  }
}

function createTelegramConfig(root: string): TelegramRuntimeConfig {
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

function createPollingSource(updates: TelegramUpdate[]) {
  const commits: number[] = [];

  return {
    async getUpdates(): Promise<TelegramUpdate[]> {
      return updates;
    },
    async commit(updateId: number): Promise<void> {
      commits.push(updateId);
    },
    commits,
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

test("telegram service emits assistant stages, todo previews, and the final reply in chat order while hiding non-todo tool previews", async (t) => {
  const root = await createTempWorkspace("telegram-visible-events-order", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FakeTelegramBotApiClient();
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });
  const pollingSource = createPollingSource([createPrivateUpdate(10, "mirror visible events")]);

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
    attachmentStore: createAttachmentStore() as never,
    pollingSource: pollingSource as never,
    runTurn: async (options) => {
      options.callbacks?.onReasoningDelta?.("reasoning-1");
      options.callbacks?.onReasoningDelta?.("reasoning-2");
      options.callbacks?.onAssistantDelta?.("assistant stage");
      options.callbacks?.onToolCall?.("search_files", "{}");
      options.callbacks?.onToolCall?.("search_files", "{}");
      options.callbacks?.onToolResult?.("search_files", "{\"preview\":\"matched TODO in src/app.ts line 10\"}");
      options.callbacks?.onToolResult?.("search_files", "{\"preview\":\"matched TODO in src/ui.ts line 22\"}");
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
    bot.sentMessages.map((entry) => entry.text),
    [
      "assistant stage",
      "[ ] #1: same todo preview",
      "[ ] #1: same todo preview",
      "assistant content",
    ],
  );
});

test("telegram service emits non-streamed assistant stage text before todo previews while hiding non-todo tool previews", async (t) => {
  const root = await createTempWorkspace("telegram-visible-assistant-stage", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new FakeTelegramBotApiClient();
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot,
    deliveryConfig: telegram.delivery,
  });
  const pollingSource = createPollingSource([createPrivateUpdate(13, "assistant stage visible")]);

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
    attachmentStore: createAttachmentStore() as never,
    pollingSource: pollingSource as never,
    runTurn: async (options) => {
      (
        options.callbacks as {
          onAssistantStage?: (text: string) => void;
        } | undefined
      )?.onAssistantStage?.("现在我先检查一下桌面目录。");
      options.callbacks?.onToolCall?.("list_files", "{\"path\":\"Desktop\"}");
      options.callbacks?.onToolResult?.(
        "list_files",
        JSON.stringify({
          entries: [
            { type: "file", path: "Desktop/.env" },
            { type: "directory", path: "Desktop/deadmouse" },
          ],
        }),
      );
      options.callbacks?.onToolResult?.("todo_write", JSON.stringify({ preview: "[x] #1: same todo preview" }));
      options.callbacks?.onAssistantText?.("检查完成。");
      options.callbacks?.onAssistantDone?.("检查完成。");
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
    bot.sentMessages.map((entry) => entry.text),
    [
      "现在我先检查一下桌面目录。",
      "[x] #1: same todo preview",
      "检查完成。",
    ],
  );
});

test("telegram service does not commit updates before visible events are durably enqueued", async (t) => {
  const root = await createTempWorkspace("telegram-visible-events-commit", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const pollingSource = createPollingSource([createPrivateUpdate(11, "wait for durable visible event")]);
  let enqueueStarted = false;
  let resolveEnqueue!: () => void;
  const enqueueGate = new Promise<void>((resolve) => {
    resolveEnqueue = resolve;
  });

  const service = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: new FakeTelegramBotApiClient(),
    sessionStore,
    sessionMapStore,
    offsetStore,
    attachmentStore: createAttachmentStore() as never,
    deliveryQueue: {
      async flushDue() {
        return;
      },
      async enqueue() {
        enqueueStarted = true;
        await enqueueGate;
        return {} as never;
      },
    } as unknown as TelegramDeliveryQueue,
    pollingSource: pollingSource as never,
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

  assert.deepEqual(pollingSource.commits, [11]);
});

test("telegram service does not swallow visible enqueue failures or commit updates early", async (t) => {
  const root = await createTempWorkspace("telegram-visible-events-failure", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const pollingSource = createPollingSource([createPrivateUpdate(12, "fail visible enqueue")]);
  let enqueueStarted = false;

  const service = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: new FakeTelegramBotApiClient(),
    sessionStore,
    sessionMapStore,
    offsetStore,
    attachmentStore: createAttachmentStore() as never,
    deliveryQueue: {
      async flushDue() {
        return;
      },
      async enqueue() {
        enqueueStarted = true;
        throw new Error("durable enqueue failed");
      },
    } as unknown as TelegramDeliveryQueue,
    pollingSource: pollingSource as never,
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
  assert.equal(await offsetStore.load(), null);
});
