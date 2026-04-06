import fs from "node:fs/promises";
import path from "node:path";

import type { ManagedTurnOptions } from "../agent/managedTurn.js";
import type { SessionStoreLike } from "../agent/sessionStore.js";
import type { RunTurnResult } from "../agent/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { PerPeerCommandQueue } from "./commandQueue.js";
import {
  FileTelegramAttachmentStore,
  type TelegramAttachmentStoreLike,
} from "./attachmentStore.js";
import { TelegramLongPollingSource } from "./polling.js";
import type { TelegramOffsetStoreLike } from "./offsetStore.js";
import { createConsoleTelegramLogger, type TelegramLogger } from "./logger.js";
import { chunkTelegramMessage } from "./messageChunking.js";
import type { TelegramSessionMapStoreLike } from "./sessionMapStore.js";
import { runTelegramTurn, type TelegramActiveTurn } from "./turnRunner.js";
import { summarizeText } from "./turnLogging.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
import { classifyTelegramUpdate } from "./updateFilter.js";
import { TelegramDeliveryQueue } from "./deliveryQueue.js";
import type { TelegramPrivateMessage, TelegramUpdate } from "./types.js";

export interface TelegramServiceOptions {
  cwd: string;
  config: RuntimeConfig;
  bot: TelegramBotApiClient;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  sessionMapStore: TelegramSessionMapStoreLike;
  offsetStore: TelegramOffsetStoreLike;
  deliveryQueue: TelegramDeliveryQueue;
  attachmentStore?: TelegramAttachmentStoreLike;
  commandQueue?: PerPeerCommandQueue;
  runTurn?: (options: ManagedTurnOptions) => Promise<RunTurnResult>;
  pollingSource?: TelegramLongPollingSource;
  logger?: TelegramLogger;
  sleep?: (ms: number) => Promise<void>;
}

export class TelegramService {
  private readonly pollingSource: TelegramLongPollingSource;
  private readonly commandQueue: PerPeerCommandQueue;
  private readonly attachmentStore: TelegramAttachmentStoreLike;
  private readonly logger: TelegramLogger;
  private readonly inFlightTasks = new Set<Promise<void>>();
  private readonly activeTurns = new Map<string, TelegramActiveTurn>();
  private readonly pendingStopRequests = new Set<string>();
  private readonly queuedTurnCounts = new Map<string, number>();
  private stopped = false;

  constructor(private readonly options: TelegramServiceOptions) {
    this.commandQueue = options.commandQueue ?? new PerPeerCommandQueue();
    this.pollingSource =
      options.pollingSource ??
      new TelegramLongPollingSource(options.bot, options.offsetStore, options.config.telegram);
    this.attachmentStore =
      options.attachmentStore ??
      new FileTelegramAttachmentStore(path.join(options.config.telegram.stateDir, "attachments.json"));
    this.logger = options.logger ?? createConsoleTelegramLogger();
  }

  stop(): void {
    this.stopped = true;
    this.abortAllActiveTurns("Telegram service stopping.");
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    this.logger.info("service online", {
      detail: `state=${this.options.config.telegram.stateDir}`,
    });

    try {
      while (!this.stopped && !signal?.aborted) {
        try {
          await this.runOnce(signal);
        } catch (error) {
          if (signal?.aborted) {
            break;
          }

          this.logger.error("polling failure", {
            detail: error instanceof Error ? error.message : String(error),
          });
          await this.sleep(this.options.config.telegram.polling.retryBackoffMs);
        }
      }
    } finally {
      await this.waitForIdle();
    }
  }

  async runOnce(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    await this.options.deliveryQueue.flushDue();

    const updates = await this.pollingSource.getUpdates(signal);
    for (const update of updates) {
      await this.processUpdate(update);
      await this.pollingSource.commit(update.update_id);
    }

    await this.options.deliveryQueue.flushDue();
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlightTasks.size > 0) {
      await Promise.allSettled([...this.inFlightTasks]);
    }
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const classified = classifyTelegramUpdate(update, {
      allowedUserIds: this.options.config.telegram.allowedUserIds,
    });

    if (classified.kind === "ignore") {
      return;
    }

    if (classified.kind === "private_message" && isStopCommand(classified.text)) {
      await this.handleStopCommand(classified);
      return;
    }

    this.logger.info("received inbound message", {
      peerKey: classified.peerKey,
      userId: classified.userId,
      chatId: classified.chatId,
      inputKind: classified.kind === "private_file_message" ? "file" : "text",
      fileName: classified.kind === "private_file_message" ? classified.fileName : undefined,
    });

    this.incrementQueuedTurns(classified.peerKey);
    const task = this.commandQueue.enqueue(classified.peerKey, async () => {
      await runTelegramTurn({
        cwd: this.options.cwd,
        config: this.options.config,
        bot: this.options.bot,
        sessionStore: this.options.sessionStore,
        sessionMapStore: this.options.sessionMapStore,
        attachmentStore: this.attachmentStore,
        deliveryQueue: this.options.deliveryQueue,
        logger: this.logger,
        message: classified,
        runTurn: this.options.runTurn,
        enqueueReply: (chatId, text) => this.enqueueReply(chatId, text),
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
    this.trackTask(task, {
      peerKey: classified.peerKey,
      userId: classified.userId,
      chatId: classified.chatId,
    });
  }

  private async handleStopCommand(message: TelegramPrivateMessage): Promise<void> {
    const activeTurn = this.activeTurns.get(message.peerKey);
    if (activeTurn && !activeTurn.controller.signal.aborted) {
      activeTurn.controller.abort();
      await this.enqueueReply(message.chatId, "Stopping the current Telegram task. The bot stays online for your next request.");
      await this.options.deliveryQueue.flushDue();
      this.logger.info("stop requested", {
        peerKey: message.peerKey,
        userId: message.userId,
        chatId: message.chatId,
        sessionId: activeTurn.sessionId,
      });
      return;
    }

    if (this.getQueuedTurnCount(message.peerKey) > 0) {
      this.pendingStopRequests.add(message.peerKey);
      await this.enqueueReply(message.chatId, "Stopping the current Telegram task. The bot stays online for your next request.");
      await this.options.deliveryQueue.flushDue();
      this.logger.info("stop armed for queued turn", {
        peerKey: message.peerKey,
        userId: message.userId,
        chatId: message.chatId,
      });
      return;
    }

    await this.enqueueReply(message.chatId, "No Telegram task is running right now.");
    await this.options.deliveryQueue.flushDue();
    this.logger.info("stop requested with no active turn", {
      peerKey: message.peerKey,
      userId: message.userId,
      chatId: message.chatId,
    });
  }

  private async enqueueReply(chatId: number, text: string): Promise<void> {
    if (!text) {
      return;
    }

    for (const chunk of chunkTelegramMessage(text, this.options.config.telegram.messageChunkChars)) {
      await this.options.deliveryQueue.enqueue({
        chatId,
        text: chunk,
      });
      this.logger.info("queued text reply", {
        chatId,
        detail: summarizeText(chunk),
      });
    }
  }

  private async ensureStateDirectory(): Promise<void> {
    await fs.mkdir(this.options.config.telegram.stateDir, { recursive: true });
  }

  private trackTask(
    task: Promise<void>,
    context: {
      peerKey: string;
      userId: number;
      chatId: number;
    },
  ): void {
    const tracked = task
      .catch((error) => {
        this.logger.error("background task failure", {
          ...context,
          detail: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(async () => {
        this.inFlightTasks.delete(tracked);
        await this.options.deliveryQueue.flushDue().catch((error) => {
          this.logger.error("delivery flush failure", {
            ...context,
            detail: error instanceof Error ? error.message : String(error),
          });
        });
      });
    this.inFlightTasks.add(tracked);
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
}

function isStopCommand(input: string): boolean {
  return input.trim().toLowerCase() === "/stop";
}
