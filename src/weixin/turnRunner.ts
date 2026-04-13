import path from "node:path";

import type { SessionStoreLike } from "../agent/session.js";
import { runBoundHostTurn } from "../host/boundTurn.js";
import { ensureBoundSession, persistBoundSession } from "../host/session.js";
import type { HostManagedTurnRunner } from "../host/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { WeixinAttachmentStoreLike } from "./attachmentStore.js";
import { WEIXIN_TYPING_STATUS, type WeixinClientLike } from "./client.js";
import type { WeixinDeliveryQueue } from "./deliveryQueue.js";
import {
  buildWeixinMediaTurnInput,
  buildWeixinTextTurnInput,
  downloadWeixinAttachment,
} from "./inboundFiles.js";
import { handleWeixinLocalCommand } from "./localCommands.js";
import type { WeixinLogger } from "./logger.js";
import { WeixinOutputPort } from "./outputPort.js";
import { createWeixinSendFileTool } from "./sendFileTool.js";
import type { WeixinSessionBinding, WeixinSessionMapStoreLike } from "./sessionMapStore.js";
import { WeixinTurnDisplay } from "./turnDisplay.js";
import { createLoggedWeixinCallbacks } from "./turnLogging.js";
import type { WeixinPrivateMessage } from "./types.js";

export interface WeixinActiveTurn {
  controller: AbortController;
  userId: string;
  sessionId: string;
  waitForVisibleMessages: () => Promise<void>;
}

export async function runWeixinTurn(options: {
  cwd: string;
  config: RuntimeConfig;
  client: WeixinClientLike;
  sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
  sessionMapStore: WeixinSessionMapStoreLike;
  attachmentStore: WeixinAttachmentStoreLike;
  deliveryQueue: WeixinDeliveryQueue;
  logger: WeixinLogger;
  message: WeixinPrivateMessage;
  runTurn?: HostManagedTurnRunner;
  enqueueReply: (userId: string, text: string) => Promise<void>;
  markQueuedTurnStarted: (peerKey: string) => void;
  consumePendingStop: (peerKey: string) => boolean;
  onActiveTurnStart: (peerKey: string, activeTurn: WeixinActiveTurn) => void;
  onActiveTurnEnd: (peerKey: string) => void;
}): Promise<void> {
  const output = new WeixinOutputPort({
    userId: options.message.userId,
    messageChunkChars: options.config.weixin.messageChunkChars,
    enqueueReply: async (userId, text) => options.enqueueReply(userId, text),
  });
  let { binding, session } = await ensureWeixinBoundSession(options);
  options.logger.info("session ready", {
    peerKey: options.message.peerKey,
    userId: options.message.userId,
    sessionId: session.id,
  });

  try {
    if (options.message.kind === "private_text_message") {
      const localCommandResult = await handleWeixinLocalCommand(
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
        output.warn("Weixin does not support interactive multiline mode. Send the full message directly.");
        return;
      }
    }

    let typingConfigPromise: Promise<string | null> | null = null;
    const resolveTypingTicket = async (): Promise<string | null> => {
      typingConfigPromise ??= options.client.getTypingConfig(
        options.message.userId,
        options.message.contextToken,
      )
        .then((result) => result.typingTicket)
        .catch(() => null);
      return typingConfigPromise;
    };
    const display = new WeixinTurnDisplay({
      userId: options.message.userId,
      sendTyping: async (userId) => {
        const typingTicket = await resolveTypingTicket();
        if (!typingTicket) {
          return;
        }

        await options.client.sendTyping(userId, typingTicket, WEIXIN_TYPING_STATUS);
      },
      enqueueVisibleMessage: async (target, text) => options.enqueueReply(target.userId, text),
      typingIntervalMs: options.config.weixin.typingIntervalMs,
    });
    const callbacks = createLoggedWeixinCallbacks(display, options.logger, {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      sessionId: session.id,
    });
    const extraTools = [
      createWeixinSendFileTool({
        peerKey: options.message.peerKey,
        userId: options.message.userId,
        deliveryQueue: options.deliveryQueue,
        logger: options.logger,
      }),
    ];
    options.logger.info("starting turn", {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      sessionId: session.id,
      inputKind: options.message.kind === "private_text_message" ? "text" : options.message.mediaKind,
      fileName: options.message.kind === "private_file_message" ? options.message.fileName : undefined,
    });

    session = await runBoundHostTurn<WeixinActiveTurn>(
      {
        host: "weixin",
        buildInput: () => buildTurnInput(options.message, session.id, options),
        cwd: options.cwd,
        stateRootDir: resolveHostStateRoot(options.config.weixin.stateDir, options.cwd),
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
            sessionId: nextSession.id,
            detail: result.changedPaths.length > 0 ? `changed=${result.changedPaths.length}` : "changed=0",
          });
        },
        onPaused: (result, nextSession) => {
          options.logger.info("turn completed", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            sessionId: nextSession.id,
            detail: result.changedPaths.length > 0 ? `changed=${result.changedPaths.length}` : "changed=0",
          });
        },
        onAborted: (nextSession) => {
          options.logger.info("turn stopped", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
            sessionId: nextSession.id,
          });
        },
        onFailed: (errorMessage, nextSession) => {
          options.logger.error("turn failed", {
            peerKey: options.message.peerKey,
            userId: options.message.userId,
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
  message: WeixinPrivateMessage,
  sessionId: string,
  options: {
    client: WeixinClientLike;
    cwd: string;
    config: RuntimeConfig;
    attachmentStore: WeixinAttachmentStoreLike;
    logger: WeixinLogger;
  },
): Promise<string> {
  if (message.kind === "private_text_message") {
    const recentAttachments = await options.attachmentStore.listByPeer(message.peerKey, 5);
    return buildWeixinTextTurnInput(message.text, recentAttachments, options.cwd);
  }

  const attachment = await downloadWeixinAttachment({
    client: options.client,
    cwd: options.cwd,
    config: options.config.weixin,
    message,
    sessionId,
    logger: options.logger,
  });
  await options.attachmentStore.add(attachment);
  const recentAttachments = await options.attachmentStore.listByPeer(message.peerKey, 5);
  return buildWeixinMediaTurnInput(message, attachment, recentAttachments, options.cwd);
}

async function ensureWeixinBoundSession(options: {
  cwd: string;
  message: WeixinPrivateMessage;
  sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
  sessionMapStore: WeixinSessionMapStoreLike;
}): Promise<{
  binding: WeixinSessionBinding;
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

function touchBinding(binding: WeixinSessionBinding, sessionId: string): WeixinSessionBinding {
  return {
    ...binding,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
}

function resolveHostStateRoot(stateDir: string, fallbackCwd: string): string {
  const athleteDir = path.dirname(stateDir);
  return path.basename(athleteDir).toLowerCase() === ".athlete"
    ? path.dirname(athleteDir)
    : fallbackCwd;
}
