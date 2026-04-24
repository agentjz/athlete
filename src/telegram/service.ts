import fs from "node:fs/promises";
import path from "node:path";

import type { SessionStoreLike } from "../agent/session.js";
import type { HostManagedTurnRunner } from "../host/types.js";
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
import { runTelegramTurn } from "./turnRunner.js";
import { summarizeText } from "./turnLogging.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
import { classifyTelegramUpdate } from "./updateFilter.js";
import { TelegramDeliveryQueue } from "./deliveryQueue.js";
import { TelegramUpdateCommitQueue } from "./updateCommitQueue.js";
import type { TelegramPrivateMessage, TelegramUpdate } from "./types.js";
import { TelegramObservabilityWriter, resolveHostStateRoot } from "./service/observability.js";
import { TelegramTurnState } from "./service/turnState.js";
import { describeIgnoredTelegramUpdate, isStopCommand } from "./service/updateClassification.js";

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
  runTurn?: HostManagedTurnRunner;
  pollingSource?: TelegramLongPollingSource;
  logger?: TelegramLogger;
  sleep?: (ms: number) => Promise<void>;
}

export class TelegramService {
  private readonly pollingSource: TelegramLongPollingSource;
  private readonly commandQueue: PerPeerCommandQueue;
  private readonly attachmentStore: TelegramAttachmentStoreLike;
  private readonly logger: TelegramLogger;
  private readonly observability: TelegramObservabilityWriter;
  private readonly turnState = new TelegramTurnState();
  private readonly inFlightTasks = new Set<Promise<void>>();
  private readonly pendingUpdateCommitQueue = new TelegramUpdateCommitQueue();
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
    this.observability = new TelegramObservabilityWriter(
      resolveHostStateRoot(options.config.telegram.stateDir, options.cwd),
    );
    options.deliveryQueue.subscribe?.({
      onDeliveryFailed: (entry, error) => {
        this.observability.queueHostMessage("failed", {
          direction: "outbound",
          deliveryKind: entry.kind === "file" ? "file" : "text",
          chatId: entry.chatId,
          fileName: entry.kind === "file" ? entry.fileName : undefined,
        }, error);
      },
    });
  }

  stop(): void {
    this.stopped = true;
    this.turnState.abortAllActiveTurns("Telegram service stopping.");
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    this.logger.info("service online", {
      detail: `state=${this.options.config.telegram.stateDir}`,
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
          await this.sleep(this.options.config.telegram.polling.retryBackoffMs);
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

    const updates = await this.pollingSource.getUpdates(signal);
    const turnTasks: Promise<void>[] = [];
    for (const update of updates) {
      const { task } = await this.processUpdate(update);
      if (task) {
        turnTasks.push(task);
      }
    }
    if (turnTasks.length > 0) {
      await Promise.all(turnTasks);
    }
    for (const update of updates) {
      await this.pollingSource.commit(update.update_id);
    }

    await this.options.deliveryQueue.flushDue();
  }

  private async runPollIteration(signal?: AbortSignal): Promise<void> {
    await this.ensureStateDirectory();
    await this.options.deliveryQueue.flushDue();

    const updates = await this.pollingSource.getUpdates(signal);

    for (const update of updates) {
      if (this.pendingUpdateCommitQueue.hasPending(update.update_id)) {
        continue;
      }

      this.pendingUpdateCommitQueue.markPending(update.update_id);
      const { task } = await this.processUpdate(update);
      this.pendingUpdateCommitQueue.queueCommit(update.update_id, task ? [task] : []);
    }

    await this.pendingUpdateCommitQueue.drain((updateId) => this.pollingSource.commit(updateId));
    await this.options.deliveryQueue.flushDue();
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlightTasks.size > 0) {
      await Promise.allSettled([...this.inFlightTasks]);
    }
    await this.observability.waitForIdle();
  }

  private async processUpdate(update: TelegramUpdate): Promise<{
    task: Promise<void> | null;
  }> {
    const classified = classifyTelegramUpdate(update, {
      allowedUserIds: this.options.config.telegram.allowedUserIds,
    });

    if (classified.kind === "ignore") {
      this.logger.info("ignored inbound update", {
        userId: classified.userId,
        chatId: classified.chatId,
        detail: describeIgnoredTelegramUpdate(classified),
      });
      return { task: null };
    }

    if (classified.kind === "private_message" && isStopCommand(classified.text)) {
      await this.handleStopCommand(classified);
      return { task: null };
    }

    this.logger.info("received inbound message", {
      peerKey: classified.peerKey,
      userId: classified.userId,
      chatId: classified.chatId,
      inputKind: classified.kind === "private_file_message" ? "file" : "text",
      fileName: classified.kind === "private_file_message" ? classified.fileName : undefined,
    });
    this.observability.queueHostMessage("accepted", {
      direction: "inbound",
      peerKey: classified.peerKey,
      userId: classified.userId,
      chatId: classified.chatId,
      inputKind: classified.kind === "private_file_message" ? "file" : "text",
      fileName: classified.kind === "private_file_message" ? classified.fileName : undefined,
    });

    this.turnState.incrementQueuedTurns(classified.peerKey);
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
        markQueuedTurnStarted: (peerKey) => this.turnState.decrementQueuedTurns(peerKey),
        consumePendingStop: (peerKey) => this.turnState.consumePendingStop(peerKey),
        onActiveTurnStart: (peerKey, activeTurn) => this.turnState.setActiveTurn(peerKey, activeTurn),
        onActiveTurnEnd: (peerKey) => this.turnState.clearActiveTurn(peerKey),
      });
    });
    return {
      task: this.trackTask(task, {
        peerKey: classified.peerKey,
        userId: classified.userId,
        chatId: classified.chatId,
      }),
    };
  }

  private async handleStopCommand(message: TelegramPrivateMessage): Promise<void> {
    const activeTurn = this.turnState.getActiveTurn(message.peerKey);
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

    if (this.turnState.getQueuedTurnCount(message.peerKey) > 0) {
      this.turnState.armPendingStop(message.peerKey);
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
      this.observability.queueHostMessage("queued", {
        direction: "outbound",
        deliveryKind: "text",
        chatId,
      });
      this.logger.info("queued text reply", {
        chatId,
        detail: summarizeText(chunk),
      });
    }

    await this.options.deliveryQueue.flushDue();
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

}
