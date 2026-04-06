import crypto from "node:crypto";

import type {
  TelegramSendDocumentRequest,
  TelegramSendMessageRequest,
} from "./botApiClient.js";
import type { TelegramConfig } from "./config.js";
import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface TelegramDeliveryTarget {
  sendMessage(request: TelegramSendMessageRequest): Promise<unknown>;
  sendDocument(request: TelegramSendDocumentRequest): Promise<unknown>;
}

interface TelegramDeliveryEntryBase {
  id: string;
  kind: "text" | "file";
  chatId: number;
  attemptCount: number;
  createdAt: number;
  nextAttemptAt: number;
  lastError?: string;
}

export interface TelegramTextDeliveryEntry extends TelegramDeliveryEntryBase {
  kind: "text";
  text: string;
}

export interface TelegramFileDeliveryEntry extends TelegramDeliveryEntryBase {
  kind: "file";
  filePath: string;
  fileName?: string;
  caption?: string;
}

export type TelegramDeliveryEntry = TelegramTextDeliveryEntry | TelegramFileDeliveryEntry;

export class TelegramDeliveryQueue {
  private operationTail = Promise.resolve();

  constructor(
    private readonly options: {
      storePath: string;
      target: TelegramDeliveryTarget;
      deliveryConfig: TelegramConfig["delivery"];
      now?: () => number;
      onDelivered?: (entry: TelegramDeliveryEntry) => void;
      onDeliveryFailed?: (entry: TelegramDeliveryEntry, error: unknown) => void;
    },
  ) {}

  async enqueue(input: { chatId: number; text: string }): Promise<TelegramTextDeliveryEntry> {
    return this.withLock(async () => {
      const entries = await this.readEntries();
      const now = this.now();
      const entry: TelegramTextDeliveryEntry = {
        id: crypto.randomUUID(),
        kind: "text",
        chatId: input.chatId,
        text: input.text,
        attemptCount: 0,
        createdAt: now,
        nextAttemptAt: now,
      };
      entries.push(entry);
      entries.sort((left, right) => left.createdAt - right.createdAt);
      await this.writeEntries(entries);
      return entry;
    });
  }

  async enqueueFile(input: {
    chatId: number;
    filePath: string;
    fileName?: string;
    caption?: string;
  }): Promise<TelegramFileDeliveryEntry> {
    return this.withLock(async () => {
      const entries = await this.readEntries();
      const now = this.now();
      const entry: TelegramFileDeliveryEntry = {
        id: crypto.randomUUID(),
        kind: "file",
        chatId: input.chatId,
        filePath: input.filePath,
        fileName: input.fileName,
        caption: input.caption,
        attemptCount: 0,
        createdAt: now,
        nextAttemptAt: now,
      };
      entries.push(entry);
      entries.sort((left, right) => left.createdAt - right.createdAt);
      await this.writeEntries(entries);
      return entry;
    });
  }

  async flushDue(): Promise<void> {
    await this.withLock(async () => {
      const entries = await this.readEntries();
      const now = this.now();
      let dirty = false;

      for (const entry of entries) {
        if (entry.nextAttemptAt > now) {
          continue;
        }

        try {
          await this.deliver(entry);
          dirty = true;
          entry.nextAttemptAt = Number.NaN;
          this.options.onDelivered?.(entry);
        } catch (error) {
          dirty = true;
          entry.attemptCount += 1;
          entry.lastError = error instanceof Error ? error.message : String(error);
          entry.nextAttemptAt = now + computeBackoffMs(entry.attemptCount, this.options.deliveryConfig);
          this.options.onDeliveryFailed?.(entry, error);
        }
      }

      if (!dirty) {
        return;
      }

      await this.writeEntries(entries.filter((entry) => Number.isFinite(entry.nextAttemptAt)));
    });
  }

  async listPending(): Promise<TelegramDeliveryEntry[]> {
    return this.withLock(async () => this.readEntries());
  }

  private async deliver(entry: TelegramDeliveryEntry): Promise<void> {
    if (entry.kind === "file") {
      await this.options.target.sendDocument({
        chatId: entry.chatId,
        filePath: entry.filePath,
        fileName: entry.fileName,
        caption: entry.caption,
      });
      return;
    }

    await this.options.target.sendMessage({
      chatId: entry.chatId,
      text: entry.text,
    });
  }

  private async readEntries(): Promise<TelegramDeliveryEntry[]> {
    const payload = await readJsonFile<{ entries?: TelegramDeliveryEntry[] } | null>(this.options.storePath, null);
    return Array.isArray(payload?.entries) ? payload.entries : [];
  }

  private async writeEntries(entries: TelegramDeliveryEntry[]): Promise<void> {
    await writeJsonFileAtomically(this.options.storePath, {
      entries,
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function computeBackoffMs(attemptCount: number, config: TelegramConfig["delivery"]): number {
  const exponent = Math.max(0, Math.min(attemptCount - 1, config.maxRetries - 1));
  return Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
}
