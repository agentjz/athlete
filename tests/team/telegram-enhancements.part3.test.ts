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

test("README exposes the Telegram serve command without carrying detailed setup docs", async () => {
  const readme = await fs.readFile(path.join(process.cwd(), "README.md"), "utf8");

  assert.match(readme, /deadmouse telegram serve/i);
  assert.match(readme, /Telegram/i);
  assert.doesNotMatch(readme, /DEADMOUSE_TELEGRAM_TOKEN/);
  assert.doesNotMatch(readme, /DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS/);
  assert.doesNotMatch(readme, /\bweixin\b/i);
  assert.doesNotMatch(readme, /WeChat/i);
  assert.doesNotMatch(readme, /DEADMOUSE_WEIXIN/);
});
