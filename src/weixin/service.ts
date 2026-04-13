import fs from "node:fs/promises";
import path from "node:path";

import type { SessionStoreLike } from "../agent/session.js";
import type { HostManagedTurnRunner } from "../host/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { PerPeerCommandQueue } from "./commandQueue.js";
import { FileWeixinAttachmentStore, type WeixinAttachmentStoreLike } from "./attachmentStore.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinContextTokenStoreLike } from "./contextTokenStore.js";
import type { WeixinDeliveryQueue } from "./deliveryQueue.js";
import { recordObservabilityEvent } from "../observability/writer.js";
import { createConsoleWeixinLogger, type WeixinLogger } from "./logger.js";
import { chunkWeixinMessage } from "./messageChunking.js";
import { classifyWeixinMessage } from "./messageClassifier.js";
import { WeixinPollingSource } from "./polling.js";
import type { WeixinSessionMapStoreLike } from "./sessionMapStore.js";
import type { WeixinSyncBufStoreLike } from "./syncBufStore.js";
import { runWeixinTurn, type WeixinActiveTurn } from "./turnRunner.js";
import type { WeixinPollingSourceLike, WeixinPrivateTextMessage, WeixinRawMessage } from "./types.js";
import { packageWeixinVisibleReply } from "./visibleReplyPackaging.js";

export interface WeixinServiceOptions {
  cwd: string;
  config: RuntimeConfig;
  client: WeixinClientLike;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  sessionMapStore: WeixinSessionMapStoreLike;
  syncBufStore: WeixinSyncBufStoreLike;
  contextTokenStore: WeixinContextTokenStoreLike;
  deliveryQueue: WeixinDeliveryQueue;
  attachmentStore?: WeixinAttachmentStoreLike;
  commandQueue?: PerPeerCommandQueue;
  runTurn?: HostManagedTurnRunner;
  pollingSource?: WeixinPollingSourceLike;
  logger?: WeixinLogger;
  sleep?: (ms: number) => Promise<void>;
}

export class WeixinService {
  private readonly pollingSource: WeixinPollingSourceLike;
  private readonly commandQueue: PerPeerCommandQueue;
  private readonly attachmentStore: WeixinAttachmentStoreLike;
  private readonly logger: WeixinLogger;
  private readonly observabilityRootDir: string;
  private readonly inFlightTasks = new Set<Promise<void>>();
  private readonly pendingObservabilityWrites = new Set<Promise<void>>();
  private readonly activeTurns = new Map<string, WeixinActiveTurn>();
  private readonly pendingStopRequests = new Set<string>();
  private readonly pendingBatchCommits: Array<{
    syncBuf: string | null;
    messageKeys: string[];
    settled: boolean;
    error: unknown;
  }> = [];
  private readonly pendingMessageKeys = new Set<string>();
  private readonly queuedTurnCounts = new Map<string, number>();
  private stopped = false;

  constructor(private readonly options: WeixinServiceOptions) {
    this.commandQueue = options.commandQueue ?? new PerPeerCommandQueue();
    this.pollingSource =
      options.pollingSource ??
      new WeixinPollingSource(options.client, options.syncBufStore, options.config.weixin);
    this.attachmentStore =
      options.attachmentStore ??
      new FileWeixinAttachmentStore(
        options.config.weixin.attachmentStoreFile ?? path.join(options.config.weixin.stateDir, "attachments.json"),
      );
    this.logger = options.logger ?? createConsoleWeixinLogger();
    this.observabilityRootDir = resolveHostStateRoot(options.config.weixin.stateDir, options.cwd);
    options.deliveryQueue.subscribe?.({
      onDeliveryFailed: (entry, error) => {
        this.queueHostMessage("failed", {
          direction: "outbound",
          peerKey: entry.peerKey,
          userId: entry.userId,
          deliveryKind: entry.kind,
          fileName: "fileName" in entry ? entry.fileName : undefined,
        }, error);
      },
    });
  }

  stop(): void {
    this.stopped = true;
    this.abortAllActiveTurns("Weixin service stopping.");
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    this.logger.info("service online", {
      detail: `state=${this.options.config.weixin.stateDir}`,
    });

    try {
      while (!this.stopped && !signal?.aborted) {
        try {
          await this.runPollIteration(signal);
        } catch (error) {
          if (signal?.aborted) {
            break;
          }

          this.logger.error("polling failure", {
            detail: error instanceof Error ? error.message : String(error),
          });
          await this.sleep(this.options.config.weixin.polling.retryBackoffMs);
        }
      }
    } finally {
      await this.waitForIdle();
    }
  }

  async runOnce(signal?: AbortSignal): Promise<void> {
    await this.runCommittedIteration(signal);
  }

  private async runCommittedIteration(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    await this.options.deliveryQueue.flushDue();

    const batch = await this.pollingSource.poll(signal);
    const turnTasks: Promise<void>[] = [];
    for (const message of batch.messages) {
      const { task } = await this.processMessage(message);
      if (task) {
        turnTasks.push(task);
      }
    }
    if (turnTasks.length > 0) {
      await Promise.all(turnTasks);
    }
    if (batch.syncBuf) {
      await this.options.syncBufStore.save(batch.syncBuf);
    }
    await this.pollingSource.commit(batch.syncBuf);
    await this.options.deliveryQueue.flushDue();
  }

  private async runPollIteration(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    await this.options.deliveryQueue.flushDue();

    const batch = await this.pollingSource.poll(signal);
    const turnTasks: Promise<void>[] = [];
    const messageKeys: string[] = [];

    for (const message of batch.messages) {
      const messageKey = getWeixinMessageKey(message);
      if (this.pendingMessageKeys.has(messageKey)) {
        continue;
      }

      this.pendingMessageKeys.add(messageKey);
      messageKeys.push(messageKey);

      const { task } = await this.processMessage(message);
      if (task) {
        turnTasks.push(task);
      }
    }

    this.queuePendingBatchCommit(batch.syncBuf, messageKeys, turnTasks);
    await this.drainPendingBatchCommits();
    await this.options.deliveryQueue.flushDue();
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlightTasks.size > 0) {
      await Promise.allSettled([...this.inFlightTasks]);
    }
    while (this.pendingObservabilityWrites.size > 0) {
      await Promise.allSettled([...this.pendingObservabilityWrites]);
    }
  }

  private async processMessage(message: WeixinRawMessage): Promise<{
    task: Promise<void> | null;
  }> {
    const classified = classifyWeixinMessage(message, {
      allowedUserIds: this.options.config.weixin.allowedUserIds,
    });

    if (classified.kind === "ignore") {
      return { task: null };
    }

    if (classified.kind === "outbound_text_echo") {
      return { task: null };
    }

    await this.captureContextToken(classified.peerKey, classified.userId, classified.contextToken);

    if (classified.kind === "private_text_message" && isStopCommand(classified.text)) {
      await this.handleStopCommand(classified);
      return { task: null };
    }

    this.logger.info("received inbound message", {
      peerKey: classified.peerKey,
      userId: classified.userId,
      inputKind: classified.kind === "private_text_message" ? "text" : classified.mediaKind,
      fileName: classified.kind === "private_file_message" ? classified.fileName : undefined,
    });
    this.queueHostMessage("accepted", {
      direction: "inbound",
      peerKey: classified.peerKey,
      userId: classified.userId,
      inputKind: classified.kind === "private_text_message" ? "text" : classified.mediaKind,
      fileName: classified.kind === "private_file_message" ? classified.fileName : undefined,
    });

    this.incrementQueuedTurns(classified.peerKey);
    const task = this.commandQueue.enqueue(classified.peerKey, async () => {
      await runWeixinTurn({
        cwd: this.options.cwd,
        config: this.options.config,
        client: this.options.client,
        sessionStore: this.options.sessionStore,
        sessionMapStore: this.options.sessionMapStore,
        attachmentStore: this.attachmentStore,
        deliveryQueue: this.options.deliveryQueue,
        logger: this.logger,
        message: classified,
        runTurn: this.options.runTurn,
        enqueueReply: (userId, text) => this.enqueueReply(userId, text),
        markQueuedTurnStarted: (peerKey) => this.decrementQueuedTurns(peerKey),
        consumePendingStop: (peerKey) => this.pendingStopRequests.delete(peerKey),
        onActiveTurnStart: (peerKey, activeTurn) => {
          this.activeTurns.set(peerKey, activeTurn);
        },
        onActiveTurnEnd: (peerKey) => {
          this.activeTurns.delete(peerKey);
        },
      });
    });
    return {
      task: this.trackTask(task, {
        peerKey: classified.peerKey,
        userId: classified.userId,
      }),
    };
  }

  private async captureContextToken(peerKey: string, userId: string, contextToken: string): Promise<void> {
    if (!contextToken) {
      return;
    }

    await this.options.contextTokenStore.set({
      peerKey,
      userId,
      contextToken,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
  }

  private async handleStopCommand(message: WeixinPrivateTextMessage): Promise<void> {
    const activeTurn = this.activeTurns.get(message.peerKey);
    if (activeTurn && !activeTurn.controller.signal.aborted) {
      activeTurn.controller.abort();
      await this.enqueueReply(message.userId, "Stopping the current Weixin task. The service stays online for your next request.");
      await this.options.deliveryQueue.flushDue();
      this.logger.info("stop requested", {
        peerKey: message.peerKey,
        userId: message.userId,
        sessionId: activeTurn.sessionId,
      });
      return;
    }

    if (this.getQueuedTurnCount(message.peerKey) > 0) {
      this.pendingStopRequests.add(message.peerKey);
      await this.enqueueReply(message.userId, "Stopping the current Weixin task. The service stays online for your next request.");
      await this.options.deliveryQueue.flushDue();
      this.logger.info("stop armed for queued turn", {
        peerKey: message.peerKey,
        userId: message.userId,
      });
      return;
    }

    await this.enqueueReply(message.userId, "No Weixin task is running right now.");
    await this.options.deliveryQueue.flushDue();
    this.logger.info("stop requested with no active turn", {
      peerKey: message.peerKey,
      userId: message.userId,
    });
  }

  private async enqueueReply(userId: string, text: string): Promise<void> {
    if (!text) {
      return;
    }

    const peerKey = `weixin:private:${userId}`;
    const payload = await packageWeixinVisibleReply({
      stateDir: this.options.config.weixin.stateDir,
      text,
    });

    if (payload.kind === "file") {
      await this.options.deliveryQueue.enqueueFile({
        peerKey,
        userId,
        filePath: payload.filePath,
        fileName: payload.fileName,
      });
      this.queueHostMessage("queued", {
        direction: "outbound",
        peerKey,
        userId,
        deliveryKind: "file",
        fileName: payload.fileName,
      });
      this.logger.info("queued file reply", {
        peerKey,
        userId,
        fileName: payload.fileName,
        detail: summarizeText(text),
      });
      await this.options.deliveryQueue.flushDue();
      return;
    }

    for (const chunk of chunkWeixinMessage(payload.text, this.options.config.weixin.messageChunkChars)) {
      await this.options.deliveryQueue.enqueueText({
        peerKey,
        userId,
        text: chunk,
      });
      this.queueHostMessage("queued", {
        direction: "outbound",
        peerKey,
        userId,
        deliveryKind: "text",
      });
      this.logger.info("queued text reply", {
        peerKey,
        userId,
        detail: summarizeText(chunk),
      });
    }

    await this.options.deliveryQueue.flushDue();
  }

  private async ensureStateDirectory(): Promise<void> {
    await fs.mkdir(this.options.config.weixin.stateDir, { recursive: true });
  }

  private trackTask(
    task: Promise<void>,
    context: {
      peerKey: string;
      userId: string;
    },
  ): Promise<void> {
    const tracked = task
      .catch((error) => {
        this.logger.error("background task failure", {
          ...context,
          detail: error instanceof Error ? error.message : String(error),
        });
        throw error;
      })
      .finally(async () => {
        this.inFlightTasks.delete(tracked);
        try {
          await this.options.deliveryQueue.flushDue();
        } catch (error) {
          this.logger.error("delivery flush failure", {
            ...context,
            detail: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
    this.inFlightTasks.add(tracked);
    return tracked;
  }

  private abortAllActiveTurns(message: string): void {
    for (const activeTurn of this.activeTurns.values()) {
      if (!activeTurn.controller.signal.aborted) {
        activeTurn.controller.abort(message);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }

    if (this.options.sleep) {
      await this.options.sleep(ms);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private incrementQueuedTurns(peerKey: string): void {
    this.queuedTurnCounts.set(peerKey, this.getQueuedTurnCount(peerKey) + 1);
  }

  private decrementQueuedTurns(peerKey: string): void {
    const nextCount = Math.max(0, this.getQueuedTurnCount(peerKey) - 1);
    if (nextCount === 0) {
      this.queuedTurnCounts.delete(peerKey);
      return;
    }

    this.queuedTurnCounts.set(peerKey, nextCount);
  }

  private getQueuedTurnCount(peerKey: string): number {
    return this.queuedTurnCounts.get(peerKey) ?? 0;
  }

  private queueHostMessage(
    status: "accepted" | "queued" | "failed",
    details: Record<string, unknown>,
    error?: unknown,
  ): void {
    const task = recordObservabilityEvent(this.observabilityRootDir, {
      event: "host.message",
      status,
      host: "weixin",
      error,
      details,
    }).finally(() => {
      this.pendingObservabilityWrites.delete(task);
    });
    this.pendingObservabilityWrites.add(task);
  }

  private queuePendingBatchCommit(
    syncBuf: string | null,
    messageKeys: string[],
    tasks: Promise<void>[],
  ): void {
    const entry = {
      syncBuf,
      messageKeys,
      settled: false,
      error: null as unknown,
    };

    Promise.all(tasks)
      .then(() => {
        entry.settled = true;
      })
      .catch((error) => {
        entry.error = error;
        entry.settled = true;
      });

    this.pendingBatchCommits.push(entry);
  }

  private async drainPendingBatchCommits(): Promise<void> {
    while (this.pendingBatchCommits.length > 0) {
      const next = this.pendingBatchCommits[0]!;
      if (!next.settled) {
        return;
      }

      if (next.error) {
        throw next.error;
      }

      if (next.syncBuf) {
        await this.options.syncBufStore.save(next.syncBuf);
      }
      await this.pollingSource.commit(next.syncBuf);
      this.pendingBatchCommits.shift();

      for (const messageKey of next.messageKeys) {
        this.pendingMessageKeys.delete(messageKey);
      }
    }
  }
}

function isStopCommand(input: string): boolean {
  return input.trim().toLowerCase() === "/stop";
}

function summarizeText(value: string, maxChars = 100): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "empty";
  }

  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`;
}

function getWeixinMessageKey(message: WeixinRawMessage): string {
  return `${message.seq}:${message.message_id}`;
}

function resolveHostStateRoot(stateDir: string, fallbackCwd: string): string {
  const athleteDir = path.dirname(stateDir);
  return path.basename(athleteDir).toLowerCase() === ".athlete"
    ? path.dirname(athleteDir)
    : fallbackCwd;
}
