import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { ChangeStore } from "../../src/changes/store.js";
import { loadProjectContext } from "../../src/context/projectContext.js";
import { createToolRegistry } from "../../src/capabilities/tools/index.js";
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
import { classifyTelegramUpdate } from "../../src/telegram/updateFilter.js";
import { createAbortError } from "../../src/utils/abort.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

class EnhancedFakeTelegramBotApiClient {
  public readonly seenOffsets: number[] = [];
  public readonly sentMessages: Array<TelegramSendMessageRequest & { messageId: number }> = [];
  public readonly sentActions: Array<{ chatId: number; action: string }> = [];
  public readonly editedMessages: Array<{ chatId: number; messageId: number; text: string }> = [];
  public readonly deletedMessages: Array<{ chatId: number; messageId: number }> = [];
  public readonly sentDocuments: Array<{
    chatId: number;
    filePath: string;
    fileName: string;
    caption?: string;
  }> = [];
  public readonly fileDownloads: string[] = [];
  private readonly files = new Map<string, { filePath: string; content: Buffer }>();
  private nextMessageId = 9000;

  constructor(private readonly batches: TelegramUpdate[][] = []) {}

  registerFile(fileId: string, options: { filePath: string; content: string | Buffer }): void {
    this.files.set(fileId, {
      filePath: options.filePath,
      content: Buffer.isBuffer(options.content) ? options.content : Buffer.from(options.content),
    });
  }

  async getUpdates(request: { offset?: number; limit: number; timeoutSeconds: number }): Promise<TelegramUpdate[]> {
    this.seenOffsets.push(request.offset ?? 0);
    return this.batches.shift() ?? [];
  }

  async sendMessage(request: TelegramSendMessageRequest): Promise<{ messageId: number }> {
    const messageId = this.nextMessageId++;
    this.sentMessages.push({
      ...request,
      messageId,
    });
    return {
      messageId,
    };
  }

  async sendChatAction(request: { chatId: number; action: string }): Promise<void> {
    this.sentActions.push(request);
  }

  async editMessageText(request: { chatId: number; messageId: number; text: string }): Promise<void> {
    this.editedMessages.push(request);
  }

  async deleteMessage(request: { chatId: number; messageId: number }): Promise<void> {
    this.deletedMessages.push(request);
  }

  async sendDocument(request: { chatId: number; filePath: string; fileName?: string; caption?: string }): Promise<void> {
    this.sentDocuments.push({
      chatId: request.chatId,
      filePath: request.filePath,
      fileName: request.fileName ?? path.basename(request.filePath),
      caption: request.caption,
    });
  }

  async getFile(request: { fileId: string }): Promise<{ filePath: string; fileSize: number }> {
    const entry = this.files.get(request.fileId);
    if (!entry) {
      throw new Error(`Unknown Telegram file: ${request.fileId}`);
    }

    return {
      filePath: entry.filePath,
      fileSize: entry.content.byteLength,
    };
  }

  async downloadFile(request: { filePath: string }): Promise<Buffer> {
    this.fileDownloads.push(request.filePath);
    const entry = [...this.files.values()].find((candidate) => candidate.filePath === request.filePath);
    if (!entry) {
      throw new Error(`Unknown Telegram file path: ${request.filePath}`);
    }

    return entry.content;
  }
}

function createTelegramConfig(root: string, overrides: Partial<TelegramRuntimeConfig> = {}): TelegramRuntimeConfig {
  return {
    token: "123:abc",
    apiBaseUrl: "https://api.telegram.org",
    proxyUrl: "",
    allowedUserIds: [1001, 2002],
    polling: {
      timeoutSeconds: 1,
      limit: 10,
      retryBackoffMs: 5,
    },
    delivery: {
      maxRetries: 4,
      baseDelayMs: 25,
      maxDelayMs: 250,
    },
    messageChunkChars: 256,
    typingIntervalMs: 50,
    stateDir: path.join(root, ".deadmouse", "telegram"),
    ...overrides,
  };
}

function createPrivateTextUpdate(
  updateId: number,
  text: string,
  overrides: {
    userId?: number;
    chatId?: number;
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
        type: "private",
      },
    },
  };
}

function createPrivateDocumentUpdate(
  updateId: number,
  options: {
    fileId: string;
    fileName: string;
    caption?: string;
    userId?: number;
    chatId?: number;
    mimeType?: string;
    fileSize?: number;
  },
): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      caption: options.caption ?? "",
      from: {
        id: options.userId ?? 1001,
        is_bot: false,
        first_name: "Tester",
      },
      chat: {
        id: options.chatId ?? 5001,
        type: "private",
      },
      document: {
        file_id: options.fileId,
        file_unique_id: `${options.fileId}-unique`,
        file_name: options.fileName,
        mime_type: options.mimeType ?? "text/markdown",
        file_size: options.fileSize ?? 24,
      },
    } as TelegramUpdate["message"] & {
      document: {
        file_id: string;
        file_unique_id: string;
        file_name: string;
        mime_type: string;
        file_size: number;
      };
    },
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

async function createToolContext(root: string, options: {
  cwd: string;
  config: ReturnType<typeof createTestRuntimeConfig>;
  sessionId: string;
}): Promise<Record<string, unknown>> {
  const projectContext = await loadProjectContext(root);
  return {
    config: options.config,
    cwd: options.cwd,
    sessionId: options.sessionId,
    identity: {
      kind: "lead",
      name: "lead",
    },
    projectContext,
    changeStore: new ChangeStore(options.config.paths.changesDir),
    createToolRegistry,
  };
}

test("telegram update filter accepts authorized private document messages instead of dropping them as empty input", () => {
  const classified = classifyTelegramUpdate(
    createPrivateDocumentUpdate(41, {
      fileId: "file-a",
      fileName: "brief.md",
      caption: "",
    }),
    {
      allowedUserIds: [1001],
    },
  );

  assert.equal(classified.kind, "private_file_message");
  assert.equal((classified as { fileName?: string }).fileName, "brief.md");
});

test("telegram delivery queue persists file deliveries, retries failures, and restores them after restart", async (t) => {
  const root = await createTempWorkspace("telegram-file-delivery", t);
  const queuePath = path.join(root, "delivery.json");
  const reportPath = path.join(root, "report.md");
  await fs.writeFile(reportPath, "# report\n", "utf8");
  let now = 1_000;
  let failNextDocument = true;
  const sentKinds: string[] = [];
  const sentDocuments: Array<{ chatId: number; fileName: string }> = [];

  const queue = new TelegramDeliveryQueue({
    storePath: queuePath,
    target: {
      async sendMessage(request: TelegramSendMessageRequest) {
        sentKinds.push(`text:${request.text}`);
      },
      async sendDocument(request: { chatId: number; filePath: string; fileName?: string }) {
        sentKinds.push("file");
        if (failNextDocument) {
          failNextDocument = false;
          throw new Error("temporary telegram document outage");
        }

        sentDocuments.push({
          chatId: request.chatId,
          fileName: request.fileName ?? path.basename(request.filePath),
        });
      },
    } as unknown as TelegramBotApiClient,
    now: () => now,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 25,
      maxDelayMs: 250,
    },
  });

  assert.equal(typeof (queue as unknown as { enqueueFile?: unknown }).enqueueFile, "function");
  await (queue as unknown as {
    enqueueFile(input: { chatId: number; filePath: string; fileName?: string; caption?: string }): Promise<unknown>;
  }).enqueueFile({
    chatId: 42,
    filePath: reportPath,
    fileName: "report.md",
    caption: "ready",
  });

  await queue.flushDue();

  let pending = await queue.listPending();
  assert.equal(pending.length, 1);
  assert.equal((pending[0] as { kind?: string }).kind, "file");
  assert.equal(pending[0]!.attemptCount, 1);

  now = pending[0]!.nextAttemptAt + 1;

  const restored = new TelegramDeliveryQueue({
    storePath: queuePath,
    target: {
      async sendMessage() {
        sentKinds.push("text-restored");
      },
      async sendDocument(request: { chatId: number; filePath: string; fileName?: string }) {
        sentKinds.push("file-restored");
        sentDocuments.push({
          chatId: request.chatId,
          fileName: request.fileName ?? path.basename(request.filePath),
        });
      },
    } as unknown as TelegramBotApiClient,
    now: () => now,
    deliveryConfig: {
      maxRetries: 5,
      baseDelayMs: 25,
      maxDelayMs: 250,
    },
  });

  await restored.flushDue();

  pending = await restored.listPending();
  assert.deepEqual(pending, []);
  assert.deepEqual(sentDocuments, [{ chatId: 42, fileName: "report.md" }]);
  assert.equal(sentKinds.includes("file"), true);
});

test("telegram service downloads inbound files, persists attachment metadata, and routes the file into the turn context", async (t) => {
  const root = await createTempWorkspace("telegram-inbound-file", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new EnhancedFakeTelegramBotApiClient([[
    createPrivateDocumentUpdate(70, {
      fileId: "file-brief",
      fileName: "brief.md",
      caption: "Please analyze the file I just sent.",
    }),
  ]]);
  bot.registerFile("file-brief", {
    filePath: "documents/brief.md",
    content: "# Brief\n\n- item 1\n",
  });
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot as unknown as TelegramBotApiClient,
    deliveryConfig: telegram.delivery,
  });
  const seenInputs: string[] = [];

  const service = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: bot as unknown as TelegramBotApiClient,
    sessionStore,
    sessionMapStore,
    offsetStore,
    deliveryQueue,
    runTurn: async (options) => {
      seenInputs.push(options.input);
      options.callbacks?.onAssistantDone?.("Received the file and started analyzing.");
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
  await waitFor(() => seenInputs.length === 1 && bot.sentMessages.length > 0);

  assert.equal(bot.fileDownloads.length, 1);
  assert.match(seenInputs[0] ?? "", /brief\.md/i);
  assert.match(seenInputs[0] ?? "", /Telegram/i);
  assert.match(seenInputs[0] ?? "", /Please analyze/i);
  const attachmentStorePath = path.join(telegram.stateDir, "attachments.json");
  const attachmentStore = await fs.readFile(attachmentStorePath, "utf8");
  assert.match(attachmentStore, /brief\.md/);
  assert.match(attachmentStore, /documents\/brief\.md|documents\\brief\.md/);
});

test("telegram service does not expose or execute quit/reset in private chat and keeps the session binding alive", async (t) => {
  const root = await createTempWorkspace("telegram-command-semantics", t);
  const runtime = createTestRuntimeConfig(root);
  const telegram = createTelegramConfig(root);
  const bot = new EnhancedFakeTelegramBotApiClient([[
    createPrivateTextUpdate(80, "/help"),
    createPrivateTextUpdate(81, "quit"),
    createPrivateTextUpdate(82, "/reset"),
  ]]);
  const sessionStore = new SessionStore(runtime.paths.sessionsDir);
  const sessionMapStore = new FileTelegramSessionMapStore(path.join(telegram.stateDir, "session-map.json"));
  const offsetStore = new FileTelegramOffsetStore(path.join(telegram.stateDir, "offset.json"));
  const deliveryQueue = new TelegramDeliveryQueue({
    storePath: path.join(telegram.stateDir, "delivery.json"),
    target: bot as unknown as TelegramBotApiClient,
    deliveryConfig: telegram.delivery,
  });
  let runTurnCount = 0;

  const service = new TelegramService({
    cwd: root,
    config: {
      ...runtime,
      telegram,
    },
    bot: bot as unknown as TelegramBotApiClient,
    sessionStore,
    sessionMapStore,
    offsetStore,
    deliveryQueue,
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
  await waitFor(() => bot.sentMessages.length >= 3);

  const combined = bot.sentMessages.map((entry) => entry.text).join("\n");
  assert.doesNotMatch(combined, /\bquit\b/i);
  assert.doesNotMatch(combined, /\n\s*\/reset\b/i);
  assert.match(combined, /\/stop/i);
  assert.equal(runTurnCount, 0);
  assert.equal(await sessionMapStore.get("telegram:private:5001") !== null, true);
});
