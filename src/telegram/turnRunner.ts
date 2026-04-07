import path from "node:path";

import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runManagedAgentTurn } from "../agent/managedTurn.js";
import type { ManagedTurnOptions } from "../agent/managedTurn.js";
import type { SessionStoreLike } from "../agent/sessionStore.js";
import type { RunTurnResult } from "../agent/types.js";
import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { isAbortError } from "../utils/abort.js";
import type {
  TelegramAttachmentStoreLike,
} from "./attachmentStore.js";
import { buildFileTurnInput, buildTextTurnInput, downloadTelegramAttachment } from "./inboundFiles.js";
import type { TelegramLogger } from "./logger.js";
import { handleTelegramLocalCommand } from "./localCommands.js";
import { TelegramOutputPort } from "./outputPort.js";
import type { TelegramSessionBinding, TelegramSessionMapStoreLike } from "./sessionMapStore.js";
import { createTelegramSendFileTool } from "./sendFileTool.js";
import { TelegramTurnDisplay } from "./turnDisplay.js";
import { createLoggedTelegramCallbacks } from "./turnLogging.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
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
  runTurn?: (input: ManagedTurnOptions) => Promise<RunTurnResult>;
  enqueueReply: (chatId: number, text: string) => Promise<void>;
  markQueuedTurnStarted: (peerKey: string) => void;
  consumePendingStop: (peerKey: string) => boolean;
  onActiveTurnStart: (peerKey: string, activeTurn: TelegramActiveTurn) => void;
  onActiveTurnEnd: (peerKey: string) => void;
}): Promise<void> {
  let binding = await getOrCreateBinding(options.message, options);
  let session = await loadBoundSession(binding, options);
  const output = new TelegramOutputPort({
    chatId: options.message.chatId,
    messageChunkChars: options.config.telegram.messageChunkChars,
    enqueueReply: async (chatId, text) => options.enqueueReply(chatId, text),
  });
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
          session: session,
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
    const controller = new AbortController();
    const shouldAbortOnStart = options.consumePendingStop(options.message.peerKey);
    options.onActiveTurnStart(options.message.peerKey, {
      controller,
      chatId: options.message.chatId,
      userId: options.message.userId,
      sessionId: session.id,
      waitForVisibleMessages: async () => display.waitForDurableVisible(),
    });
    options.markQueuedTurnStarted(options.message.peerKey);

    const turnInput = await buildTurnInput(options.message, session.id, options);
    const callbacks = createLoggedTelegramCallbacks(display, options.logger, {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      chatId: options.message.chatId,
      sessionId: session.id,
    });
    const toolRegistry = await createRuntimeToolRegistry(options.config, {
      includeTools: [
        createTelegramSendFileTool({
          chatId: options.message.chatId,
          deliveryQueue: options.deliveryQueue as never,
          logger: options.logger,
        }),
      ],
    });

    try {
      if (shouldAbortOnStart) {
        queueMicrotask(() => {
          if (!controller.signal.aborted) {
            controller.abort();
          }
        });
      }
      options.logger.info("starting turn", {
        peerKey: options.message.peerKey,
        userId: options.message.userId,
        chatId: options.message.chatId,
        sessionId: session.id,
        inputKind: options.message.kind === "private_file_message" ? "file" : "text",
        fileName: options.message.kind === "private_file_message" ? options.message.fileName : undefined,
      });
      const result = await (options.runTurn ?? runManagedAgentTurn)({
        input: turnInput,
        cwd: options.cwd,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        abortSignal: controller.signal,
        callbacks,
        toolRegistry,
        identity: {
          kind: "lead",
          name: "lead",
        },
      });
      session = result.session;
      if (result.paused && result.pauseReason) {
        output.warn(result.pauseReason);
        display.noteTerminalState();
      }
      options.logger.info("turn completed", {
        peerKey: options.message.peerKey,
        userId: options.message.userId,
        chatId: options.message.chatId,
        sessionId: session.id,
        detail: result.changedPaths.length > 0 ? `changed=${result.changedPaths.length}` : "changed=0",
      });
    } catch (error) {
      if (error instanceof AgentTurnError) {
        session = error.session;
      }

      if (isAbortError(error)) {
        display.noteTerminalState();
        output.warn("Turn interrupted. You can keep chatting.");
        options.logger.info("turn stopped", {
          peerKey: options.message.peerKey,
          userId: options.message.userId,
          chatId: options.message.chatId,
          sessionId: session.id,
        });
      } else {
        display.noteTerminalState();
        output.error(getErrorMessage(error));
        output.info("The request failed, but the session is still alive. You can keep chatting.");
        options.logger.error("turn failed", {
          peerKey: options.message.peerKey,
          userId: options.message.userId,
          chatId: options.message.chatId,
          sessionId: session.id,
          detail: getErrorMessage(error),
        });
      }
    } finally {
      options.onActiveTurnEnd(options.message.peerKey);
      await display.flush();
      display.dispose();
      await toolRegistry.close?.().catch(() => undefined);
    }
  } finally {
    options.markQueuedTurnStarted(options.message.peerKey);
    binding = touchBinding(binding, session.id);
    await options.sessionMapStore.set(binding);
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

async function getOrCreateBinding(
  message: TelegramPrivateMessage | TelegramPrivateFileMessage,
  options: {
    cwd: string;
    sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
    sessionMapStore: TelegramSessionMapStoreLike;
  },
): Promise<TelegramSessionBinding> {
  const existing = await options.sessionMapStore.get(message.peerKey);
  if (existing) {
    return touchBinding(existing, existing.sessionId);
  }

  const session = await options.sessionStore.save(await options.sessionStore.create(options.cwd));
  const now = new Date().toISOString();
  const binding: TelegramSessionBinding = {
    peerKey: message.peerKey,
    userId: message.userId,
    chatId: message.chatId,
    sessionId: session.id,
    cwd: options.cwd,
    createdAt: now,
    updatedAt: now,
  };
  await options.sessionMapStore.set(binding);
  return binding;
}

async function loadBoundSession(
  binding: TelegramSessionBinding,
  options: {
    cwd: string;
    sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
    sessionMapStore: TelegramSessionMapStoreLike;
  },
): Promise<SessionRecord> {
  try {
    return await options.sessionStore.load(binding.sessionId);
  } catch {
    const session = await options.sessionStore.save(await options.sessionStore.create(options.cwd));
    const nextBinding = touchBinding(binding, session.id);
    await options.sessionMapStore.set(nextBinding);
    return session;
  }
}

function touchBinding(binding: TelegramSessionBinding, sessionId: string): TelegramSessionBinding {
  return {
    ...binding,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
}
