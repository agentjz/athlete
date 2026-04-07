import crypto from "node:crypto";

import type { WeixinConfig } from "./config.js";
import type { WeixinContextTokenStoreLike } from "./contextTokenStore.js";
import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export class WeixinContextTokenDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeixinContextTokenDeliveryError";
  }
}

export interface WeixinDeliveryTarget {
  sendText(request: { userId: string; contextToken: string; text: string }): Promise<void>;
  sendImage(request: { userId: string; contextToken: string; filePath: string; caption?: string }): Promise<void>;
  sendVideo(request: { userId: string; contextToken: string; filePath: string; caption?: string }): Promise<void>;
  sendFile(request: { userId: string; contextToken: string; filePath: string; fileName?: string; caption?: string }): Promise<void>;
}

export type WeixinDeliveryBlockedReason = "missing_context_token" | "context_token_invalid";

interface WeixinDeliveryEntryBase {
  id: string;
  peerKey: string;
  userId: string;
  kind: "text" | "image" | "video" | "file";
  attemptCount: number;
  createdAt: number;
  nextAttemptAt: number;
  lastError?: string;
  blockedReason?: WeixinDeliveryBlockedReason;
}

export interface WeixinTextDeliveryEntry extends WeixinDeliveryEntryBase {
  kind: "text";
  text: string;
}

export interface WeixinImageDeliveryEntry extends WeixinDeliveryEntryBase {
  kind: "image";
  filePath: string;
  caption?: string;
}

export interface WeixinVideoDeliveryEntry extends WeixinDeliveryEntryBase {
  kind: "video";
  filePath: string;
  caption?: string;
}

export interface WeixinFileDeliveryEntry extends WeixinDeliveryEntryBase {
  kind: "file";
  filePath: string;
  fileName?: string;
  caption?: string;
}

export type WeixinDeliveryEntry =
  | WeixinTextDeliveryEntry
  | WeixinImageDeliveryEntry
  | WeixinVideoDeliveryEntry
  | WeixinFileDeliveryEntry;

export class WeixinDeliveryQueue {
  private operationTail = Promise.resolve();

  constructor(
    private readonly options: {
      storePath: string;
      target: WeixinDeliveryTarget;
      contextTokenStore: WeixinContextTokenStoreLike;
      deliveryConfig: WeixinConfig["delivery"];
      now?: () => number;
      onDelivered?: (entry: WeixinDeliveryEntry) => void;
      onDeliveryFailed?: (entry: WeixinDeliveryEntry, error: unknown) => void;
      onBlocked?: (entry: WeixinDeliveryEntry, reason: WeixinDeliveryBlockedReason) => void;
    },
  ) {}

  async enqueueText(input: { peerKey: string; userId: string; text: string }): Promise<WeixinTextDeliveryEntry> {
    return this.enqueue({
      peerKey: input.peerKey,
      userId: input.userId,
      kind: "text",
      text: input.text,
    });
  }

  async enqueueImage(input: { peerKey: string; userId: string; filePath: string; caption?: string }): Promise<WeixinImageDeliveryEntry> {
    return this.enqueue({
      peerKey: input.peerKey,
      userId: input.userId,
      kind: "image",
      filePath: input.filePath,
      caption: input.caption,
    });
  }

  async enqueueVideo(input: { peerKey: string; userId: string; filePath: string; caption?: string }): Promise<WeixinVideoDeliveryEntry> {
    return this.enqueue({
      peerKey: input.peerKey,
      userId: input.userId,
      kind: "video",
      filePath: input.filePath,
      caption: input.caption,
    });
  }

  async enqueueFile(input: {
    peerKey: string;
    userId: string;
    filePath: string;
    fileName?: string;
    caption?: string;
  }): Promise<WeixinFileDeliveryEntry> {
    return this.enqueue({
      peerKey: input.peerKey,
      userId: input.userId,
      kind: "file",
      filePath: input.filePath,
      fileName: input.fileName,
      caption: input.caption,
    });
  }

  async flushDue(): Promise<void> {
    await this.withLock(async () => {
      const entries = await this.readEntries();
      const now = this.now();
      let dirty = false;
      const nextEntries: WeixinDeliveryEntry[] = [];

      for (const entry of entries) {
        if (entry.nextAttemptAt > now) {
          nextEntries.push(entry);
          continue;
        }

        const token = await this.options.contextTokenStore.getUsableToken(entry.peerKey);
        if (!token) {
          const blockedReason = await this.detectBlockedReason(entry.peerKey);
          if (entry.blockedReason !== blockedReason || entry.lastError !== blockedReason) {
            dirty = true;
            entry.blockedReason = blockedReason;
            entry.lastError = blockedReason;
          }
          nextEntries.push(entry);
          this.options.onBlocked?.(entry, blockedReason);
          continue;
        }

        try {
          await this.deliver(entry, token);
          dirty = true;
          this.options.onDelivered?.(entry);
        } catch (error) {
          if (isContextTokenDeliveryFailure(error)) {
            await this.options.contextTokenStore.markInvalid(entry.peerKey, getErrorMessage(error));
            if (entry.blockedReason !== "context_token_invalid" || entry.lastError !== getErrorMessage(error)) {
              dirty = true;
            }
            entry.blockedReason = "context_token_invalid";
            entry.lastError = getErrorMessage(error);
            nextEntries.push(entry);
            this.options.onBlocked?.(entry, "context_token_invalid");
            continue;
          }

          dirty = true;
          entry.attemptCount += 1;
          entry.blockedReason = undefined;
          entry.lastError = getErrorMessage(error);
          entry.nextAttemptAt = now + computeBackoffMs(entry.attemptCount, this.options.deliveryConfig);
          nextEntries.push(entry);
          this.options.onDeliveryFailed?.(entry, error);
        }
      }

      if (!dirty) {
        return;
      }

      await this.writeEntries(nextEntries);
    });
  }

  async listPending(): Promise<WeixinDeliveryEntry[]> {
    return this.withLock(async () => this.readEntries());
  }

  private async enqueue<T extends WeixinDeliveryEntry>(
    entryLike: Omit<T, "id" | "attemptCount" | "createdAt" | "nextAttemptAt">,
  ): Promise<T> {
    return this.withLock(async () => {
      const entries = await this.readEntries();
      const now = this.now();
      const entry = {
        id: crypto.randomUUID(),
        attemptCount: 0,
        createdAt: now,
        nextAttemptAt: now,
        ...entryLike,
      } as T;
      entries.push(entry);
      entries.sort((left, right) => left.createdAt - right.createdAt);
      await this.writeEntries(entries);
      return entry;
    });
  }

  private async deliver(entry: WeixinDeliveryEntry, contextToken: string): Promise<void> {
    if (entry.kind === "text") {
      await this.options.target.sendText({
        userId: entry.userId,
        contextToken,
        text: entry.text,
      });
      return;
    }

    if (entry.kind === "image") {
      await this.options.target.sendImage({
        userId: entry.userId,
        contextToken,
        filePath: entry.filePath,
        caption: entry.caption,
      });
      return;
    }

    if (entry.kind === "video") {
      await this.options.target.sendVideo({
        userId: entry.userId,
        contextToken,
        filePath: entry.filePath,
        caption: entry.caption,
      });
      return;
    }

    await this.options.target.sendFile({
      userId: entry.userId,
      contextToken,
      filePath: entry.filePath,
      fileName: entry.fileName,
      caption: entry.caption,
    });
  }

  private async detectBlockedReason(peerKey: string): Promise<WeixinDeliveryBlockedReason> {
    const record = await this.options.contextTokenStore.get(peerKey);
    return record?.status === "invalid" ? "context_token_invalid" : "missing_context_token";
  }

  private async readEntries(): Promise<WeixinDeliveryEntry[]> {
    const payload = await readJsonFile<{ entries?: WeixinDeliveryEntry[] } | null>(this.options.storePath, null);
    return Array.isArray(payload?.entries) ? payload.entries : [];
  }

  private async writeEntries(entries: WeixinDeliveryEntry[]): Promise<void> {
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

function computeBackoffMs(attemptCount: number, config: WeixinConfig["delivery"]): number {
  const exponent = Math.max(0, Math.min(attemptCount - 1, config.maxRetries - 1));
  return Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
}

function isContextTokenDeliveryFailure(error: unknown): boolean {
  if (error instanceof WeixinContextTokenDeliveryError) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    String((error as { name?: unknown }).name) === "NoContextTokenError"
  ) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "errMsg" in error &&
    /context[_ -]?token/i.test(String((error as { errMsg?: unknown }).errMsg))
  ) {
    return true;
  }

  return /context[_ -]?token/i.test(getErrorMessage(error));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
