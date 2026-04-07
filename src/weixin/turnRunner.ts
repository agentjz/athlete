import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runManagedAgentTurn } from "../agent/managedTurn.js";
import type { ManagedTurnOptions } from "../agent/managedTurn.js";
import type { SessionStoreLike } from "../agent/sessionStore.js";
import type { RunTurnResult } from "../agent/types.js";
import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { isAbortError } from "../utils/abort.js";
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
  runTurn?: (input: ManagedTurnOptions) => Promise<RunTurnResult>;
  enqueueReply: (userId: string, text: string) => Promise<void>;
  markQueuedTurnStarted: (peerKey: string) => void;
  consumePendingStop: (peerKey: string) => boolean;
  onActiveTurnStart: (peerKey: string, activeTurn: WeixinActiveTurn) => void;
  onActiveTurnEnd: (peerKey: string) => void;
}): Promise<void> {
  let binding = await getOrCreateBinding(options.message, options);
  let session = await loadBoundSession(binding, options);
  const output = new WeixinOutputPort({
    userId: options.message.userId,
    messageChunkChars: options.config.weixin.messageChunkChars,
    enqueueReply: async (userId, text) => options.enqueueReply(userId, text),
  });
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
    const controller = new AbortController();
    const shouldAbortOnStart = options.consumePendingStop(options.message.peerKey);
    options.onActiveTurnStart(options.message.peerKey, {
      controller,
      userId: options.message.userId,
      sessionId: session.id,
      waitForVisibleMessages: async () => display.waitForDurableVisible(),
    });
    options.markQueuedTurnStarted(options.message.peerKey);

    const turnInput = await buildTurnInput(options.message, session.id, options);
    const callbacks = createLoggedWeixinCallbacks(display, options.logger, {
      peerKey: options.message.peerKey,
      userId: options.message.userId,
      sessionId: session.id,
    });
    const toolRegistry = await createRuntimeToolRegistry(options.config, {
      includeTools: [
        createWeixinSendFileTool({
          peerKey: options.message.peerKey,
          userId: options.message.userId,
          deliveryQueue: options.deliveryQueue,
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
        sessionId: session.id,
        inputKind: options.message.kind === "private_text_message" ? "text" : options.message.mediaKind,
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
          sessionId: session.id,
        });
      } else {
        display.noteTerminalState();
        output.error(getErrorMessage(error));
        output.info("The request failed, but the session is still alive. You can keep chatting.");
        options.logger.error("turn failed", {
          peerKey: options.message.peerKey,
          userId: options.message.userId,
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

async function getOrCreateBinding(
  message: WeixinPrivateMessage,
  options: {
    cwd: string;
    sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
    sessionMapStore: WeixinSessionMapStoreLike;
  },
): Promise<WeixinSessionBinding> {
  const existing = await options.sessionMapStore.get(message.peerKey);
  if (existing) {
    return touchBinding(existing, existing.sessionId);
  }

  const session = await options.sessionStore.save(await options.sessionStore.create(options.cwd));
  const now = new Date().toISOString();
  const binding: WeixinSessionBinding = {
    peerKey: message.peerKey,
    userId: message.userId,
    sessionId: session.id,
    cwd: options.cwd,
    createdAt: now,
    updatedAt: now,
  };
  await options.sessionMapStore.set(binding);
  return binding;
}

async function loadBoundSession(
  binding: WeixinSessionBinding,
  options: {
    cwd: string;
    sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
    sessionMapStore: WeixinSessionMapStoreLike;
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

function touchBinding(binding: WeixinSessionBinding, sessionId: string): WeixinSessionBinding {
  return {
    ...binding,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
}
