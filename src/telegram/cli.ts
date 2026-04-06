import path from "node:path";

import type { Command } from "commander";

import { getErrorMessage } from "../agent/errors.js";
import { SessionStore } from "../agent/sessionStore.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";
import { FetchTelegramBotApiClient } from "./botApiClient.js";
import { TelegramDeliveryQueue } from "./deliveryQueue.js";
import { createConsoleTelegramLogger } from "./logger.js";
import { FileTelegramOffsetStore } from "./offsetStore.js";
import { acquireTelegramProcessLock } from "./processLock.js";
import { applyTelegramProxyEnvironment } from "./proxy.js";
import { FileTelegramSessionMapStore } from "./sessionMapStore.js";
import { TelegramService } from "./service.js";

export async function createTelegramService(options: {
  cwd: string;
  config: RuntimeConfig;
}): Promise<TelegramService> {
  const logger = createConsoleTelegramLogger();
  applyTelegramProxyEnvironment(options.config.telegram.proxyUrl);
  const bot = new FetchTelegramBotApiClient({
    token: options.config.telegram.token,
    apiBaseUrl: options.config.telegram.apiBaseUrl,
  });
  const stateDir = options.config.telegram.stateDir;

  return new TelegramService({
    cwd: options.cwd,
    config: options.config,
    bot,
    sessionStore: new SessionStore(options.config.paths.sessionsDir),
    sessionMapStore: new FileTelegramSessionMapStore(path.join(stateDir, "session-map.json")),
    offsetStore: new FileTelegramOffsetStore(path.join(stateDir, "offset.json")),
    deliveryQueue: new TelegramDeliveryQueue({
      storePath: path.join(stateDir, "delivery.json"),
      target: bot,
      deliveryConfig: options.config.telegram.delivery,
      onDelivered(entry) {
        logger.info("delivery sent", {
          chatId: entry.chatId,
          fileName: entry.kind === "file" ? entry.fileName : undefined,
          detail: entry.kind === "file" ? "type=file" : "type=text",
        });
      },
      onDeliveryFailed(entry, error) {
        logger.error("delivery failed", {
          chatId: entry.chatId,
          fileName: entry.kind === "file" ? entry.fileName : undefined,
          detail: getErrorMessage(error),
        });
      },
    }),
    logger,
  });
}

export function registerTelegramCommands(
  program: Command,
  dependencies: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    createTelegramService?: (options: {
      cwd: string;
      config: RuntimeConfig;
    }) => Promise<{
      run(signal?: AbortSignal): Promise<void>;
      stop?(): void;
    }>;
    acquireProcessLock?: typeof acquireTelegramProcessLock;
  },
): void {
  const telegramCommand = program.command("telegram").description("Serve Telegram private-chat control.");

  telegramCommand
    .command("serve")
    .description("Run the Telegram private-chat service via long polling.")
    .action(async () => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      if (!runtime.config.telegram.token) {
        throw new Error("Telegram token missing. Set ATHLETE_TELEGRAM_TOKEN or config.telegram.token.");
      }

      if (runtime.config.telegram.allowedUserIds.length === 0) {
        throw new Error("Telegram whitelist is empty. Set ATHLETE_TELEGRAM_ALLOWED_USER_IDS or config.telegram.allowedUserIds.");
      }

      const lock = await (dependencies.acquireProcessLock ?? acquireTelegramProcessLock)({
        stateDir: runtime.config.telegram.stateDir,
      });
      const service = await (dependencies.createTelegramService ?? createTelegramService)({
        cwd: runtime.cwd,
        config: runtime.config,
      });
      console.log(
        `[telegram] starting private-chat service chat_users=${runtime.config.telegram.allowedUserIds.join(",")} state=${runtime.config.telegram.stateDir} proxy=${runtime.config.telegram.proxyUrl || "direct"}`,
      );
      const controller = new AbortController();
      const releaseSignals = bindShutdownSignals(() => {
        controller.abort();
        service.stop?.();
      });

      try {
        await service.run(controller.signal);
      } finally {
        releaseSignals();
        await lock.release();
      }
    });
}

function bindShutdownSignals(onShutdown: () => void): () => void {
  const handler = () => {
    onShutdown();
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);

  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}
