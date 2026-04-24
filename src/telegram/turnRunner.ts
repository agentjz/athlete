import path from "node:path";

import type { SessionStoreLike } from "../agent/session.js";
import { runBoundHostTurn } from "../host/boundTurn.js";
import { ensureBoundSession, persistBoundSession } from "../host/session.js";
import type { HostManagedTurnRunner } from "../host/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { TelegramAttachmentStoreLike } from "./attachmentStore.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
import { buildFileTurnInput, buildTextTurnInput, downloadTelegramAttachment } from "./inboundFiles.js";
import { handleTelegramLocalCommand } from "./localCommands.js";
import type { TelegramLogger } from "./logger.js";
import { TelegramOutputPort } from "./outputPort.js";
import type { TelegramSessionBinding, TelegramSessionMapStoreLike } from "./sessionMapStore.js";
import { createTelegramSendFileTool } from "./sendFileTool.js";
import { TelegramTurnDisplay } from "./turnDisplay.js";
import { createLoggedTelegramCallbacks } from "./turnLogging.js";
import type { TelegramPrivateFileMessage, TelegramPrivateMessage } from "./types.js";

export interface TelegramActiveTurn {
  controller: AbortController;
  chatId: number;
  userId: number;
  sessionId: string;
  waitForVisibleMessages: () => Promise<void>;
}

export async function runTelegramTurn(options: {
  cwd: string;
  config: RuntimeConfig;
  bot: TelegramBotApiClient;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  sessionMapStore: TelegramSessionMapStoreLike;
  attachmentStore: TelegramAttachmentStoreLike;
  deliveryQueue: {
    flushDue(): Promise<void>;
  };
  logger: TelegramLogger;
  message: TelegramPrivateMessage | TelegramPrivateFileMessage;
  runTurn?: HostManagedTurnRunner;
  enqueueReply: (chatId: number, text: string) => Promise<void>;
  markQueuedTurnStarted: (peerKey: string) => void;
  consumePendingStop: (peerKey: string) => boolean;
  onActiveTurnStart: (peerKey: string, activeTurn: TelegramActiveTurn) => void;
  onActiveTurnEnd: (peerKey: string) => void;
}): Promise<void> {
  const output = new TelegramOutputPort({
    chatId: options.message.chatId,
    messageChunkChars: options.config.telegram.messageChunkChars,
    enqueueReply: async (chatId, text) => options.enqueueReply(chatId, text),
  });
  let { binding, session } = await ensureTelegramBoundSession(options);
  options.logger.info("session ready", {
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    chatId: options.message.chatId,
    sessionId: session.id,
  });

  try {
    if (options.message.kind === "private_message") {
      const localCommandResult = await handleTelegramLocalCommand(
        options.message.text,
        {
          cwd: options.cwd,
          session,
          config: options.config,
        },
        output,
      );

      if (localCommandResult === "handled") {
        options.markQueuedTurnStarted(options.message.peerKey);
        return;
      }

      if (localCommandResult === "multiline") {
        options.markQueuedTurnStarted(options.message.peerKey);
        output.warn("Telegram does not support interactive multiline mode. Send the full message directly.");
        return;
      }
    }

    const display = new TelegramTurnDisplay({
      chatId: options.message.chatId,
      sendTyping: async (chatId) => {
        await options.bot.sendChatAction({
          chatId,
          action: "typing",
        });
      },
      enqueueVisibleMessage: async (target, text) => options.enqueueReply(target.chatId, text),
      typingIntervalMs: options.config.telegram.typingIntervalMs,
    });
    const callbacks = createLoggedTelegramCallbacks(display, options.logger, {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      chatId: options.message.chatId,
      sessionId: session.id,
    });
    const extraTools = [
      createTelegramSendFileTool({
        chatId: options.message.chatId,
        deliveryQueue: options.deliveryQueue as never,
        logger: options.logger,
      }),
    ];
    options.logger.info("starting turn", {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      chatId: options.message.chatId,
      sessionId: session.id,
      inputKind: options.message.kind === "private_file_message" ? "file" : "text",
      fileName: options.message.kind === "private_file_message" ? options.message.fileName : undefined,
    });

    session = await runBoundHostTurn<TelegramActiveTurn>(
      {
        host: "telegram",
        buildInput: () => buildTurnInput(options.message, session.id, options),
        cwd: options.cwd,
        stateRootDir: resolveHostStateRoot(options.config.telegram.stateDir, options.cwd),
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        output,
        display,
        callbacks,
        extraTools,
        shouldAbortOnStart: () => options.consumePendingStop(options.message.peerKey),
        markQueuedTurnStarted: () => options.markQueuedTurnStarted(options.message.peerKey),
        createActiveTurn: (controller, sessionId) => ({
          controller,
          chatId: options.message.chatId,
          userId: options.message.userId,
          sessionId,
          waitForVisibleMessages: async () => display.waitForDurableVisible(),
        }),
        onActiveTurnStart: (activeTurn) => {
          options.onActiveTurnStart(options.message.peerKey, activeTurn);
        },
        onActiveTurnEnd: () => {
          options.onActiveTurnEnd(options.message.peerKey);
        },
        onCompleted: (result, nextSession) => {
          options.logger.info("turn completed", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            chatId: options.message.chatId,
            sessionId: nextSession.id,
            detail: result.changedPaths.length > 0 ? `changed=${result.changedPaths.length}` : "changed=0",
          });
        },
        onPaused: (result, nextSession) => {
          options.logger.info("turn completed", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            chatId: options.message.chatId,
            sessionId: nextSession.id,
            detail: result.changedPaths.length > 0 ? `changed=${result.changedPaths.length}` : "changed=0",
          });
        },
        onAborted: (nextSession) => {
          options.logger.info("turn stopped", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            chatId: options.message.chatId,
            sessionId: nextSession.id,
          });
        },
        onFailed: (errorMessage, nextSession) => {
          options.logger.error("turn failed", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            chatId: options.message.chatId,
            sessionId: nextSession.id,
            detail: errorMessage,
          });
        },
      },
      {
        runTurn: options.runTurn,
      },
    );
  } finally {
    options.markQueuedTurnStarted(options.message.peerKey);
    binding = await persistBoundSession({
      binding,
      sessionId: session.id,
      touchBinding,
      saveBinding: async (nextBinding) => options.sessionMapStore.set(nextBinding),
    });
    await output.flush();
  }
}

async function buildTurnInput(
  message: TelegramPrivateMessage | TelegramPrivateFileMessage,
  sessionId: string,
  options: {
    bot: TelegramBotApiClient;
    cwd: string;
    config: RuntimeConfig;
    attachmentStore: TelegramAttachmentStoreLike;
    logger: TelegramLogger;
  },
): Promise<string> {
  if (message.kind === "private_file_message") {
    const attachment = await downloadTelegramAttachment({
      bot: options.bot,
      cwd: options.cwd,
      config: options.config.telegram,
      message,
      sessionId,
      logger: options.logger,
    });
    await options.attachmentStore.add(attachment);
    const recentAttachments = await options.attachmentStore.listByPeer(message.peerKey, 5);
    return buildFileTurnInput(message, attachment, recentAttachments, options.cwd);
  }

  const recentAttachments = await options.attachmentStore.listByPeer(message.peerKey, 5);
  return buildTextTurnInput(message.text, recentAttachments, options.cwd);
}

async function ensureTelegramBoundSession(options: {
  cwd: string;
  message: TelegramPrivateMessage | TelegramPrivateFileMessage;
  sessionStore: SessionStoreLike & {
    load(id: string): Promise<SessionRecord>;
  };
  sessionMapStore: TelegramSessionMapStoreLike;
}): Promise<{
  binding: TelegramSessionBinding;
  session: SessionRecord;
}> {
  return ensureBoundSession({
    cwd: options.cwd,
    sessionStore: options.sessionStore,
    loadBinding: async () => options.sessionMapStore.get(options.message.peerKey),
    createBinding: (session) => {
      const now = new Date().toISOString();
      return {
        peerKey: options.message.peerKey,
        userId: options.message.userId,
        chatId: options.message.chatId,
        sessionId: session.id,
        cwd: options.cwd,
        createdAt: now,
        updatedAt: now,
      };
    },
    touchBinding,
    saveBinding: async (binding) => options.sessionMapStore.set(binding),
  });
}

function touchBinding(binding: TelegramSessionBinding, sessionId: string): TelegramSessionBinding {
  return {
    ...binding,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
}

function resolveHostStateRoot(stateDir: string, fallbackCwd: string): string {
  const deadmouseDir = path.dirname(stateDir);
  return path.basename(deadmouseDir).toLowerCase() === ".deadmouse"
    ? path.dirname(deadmouseDir)
    : fallbackCwd;
}
