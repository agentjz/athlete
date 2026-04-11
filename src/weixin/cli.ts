import fs from "node:fs/promises";

import type { Command } from "commander";

import { getErrorMessage } from "../agent/errors.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";

export async function loginWeixin(options: {
  cwd: string;
  config: RuntimeConfig;
}): Promise<void> {
  const [{ OpenILinkWeixinClient }, { FileWeixinCredentialStore }, { FileWeixinSyncBufStore }] = await Promise.all([
    import("./client.js"),
    import("./credentialsStore.js"),
    import("./syncBufStore.js"),
  ]);
  const runtime = options.config.weixin;
  const client = new OpenILinkWeixinClient({
    baseUrl: runtime.baseUrl,
    cdnBaseUrl: runtime.cdnBaseUrl,
    routeTag: runtime.routeTag,
  });
  const credentials = await client.loginWithQr({
    timeoutMs: runtime.qrTimeoutMs,
    onQrCode(content) {
      console.log(content);
    },
    onScanned() {
      console.log("[weixin] QR scanned. Confirm the login in Weixin.");
    },
    onExpired(attempt, maxAttempts) {
      console.log(`[weixin] QR expired. Retrying ${attempt}/${maxAttempts}.`);
    },
  });

  await fs.mkdir(runtime.stateDir, { recursive: true });
  await new FileWeixinCredentialStore(runtime.credentialsFile).save(credentials);
  await new FileWeixinSyncBufStore(runtime.syncBufFile).clear();
  await fs.rm(runtime.contextTokenFile, { force: true }).catch(() => undefined);
  await fs.rm(runtime.deliveryQueueFile, { force: true }).catch(() => undefined);

  console.log(
    `[weixin] login complete user=${credentials.userId ?? "unknown"} bot=${credentials.botId ?? "unknown"} state=${runtime.stateDir}`,
  );
}

export async function logoutWeixin(options: {
  cwd: string;
  config: RuntimeConfig;
}): Promise<void> {
  const [{ FileWeixinCredentialStore }, { FileWeixinSyncBufStore }] = await Promise.all([
    import("./credentialsStore.js"),
    import("./syncBufStore.js"),
  ]);
  const runtime = options.config.weixin;
  await new FileWeixinCredentialStore(runtime.credentialsFile).clear();
  await new FileWeixinSyncBufStore(runtime.syncBufFile).clear();
  await fs.rm(runtime.contextTokenFile, { force: true }).catch(() => undefined);
  await fs.rm(runtime.deliveryQueueFile, { force: true }).catch(() => undefined);

  console.log(`[weixin] logged out state=${runtime.stateDir}`);
}

export async function createWeixinService(options: {
  cwd: string;
  config: RuntimeConfig;
}) {
  const [
    { SessionStore },
    { FileWeixinAttachmentStore },
    { OpenILinkWeixinClient },
    { FileWeixinContextTokenStore },
    { WeixinDeliveryQueue },
    { createConsoleWeixinLogger },
    { WeixinPollingSource },
    { FileWeixinSessionMapStore },
    { WeixinService },
    { FileWeixinSyncBufStore },
  ] = await Promise.all([
    import("../agent/session.js"),
    import("./attachmentStore.js"),
    import("./client.js"),
    import("./contextTokenStore.js"),
    import("./deliveryQueue.js"),
    import("./logger.js"),
    import("./polling.js"),
    import("./sessionMapStore.js"),
    import("./service.js"),
    import("./syncBufStore.js"),
  ]);

  const logger = createConsoleWeixinLogger();
  const credentials = options.config.weixin.credentials;
  if (!credentials?.token) {
    throw new Error("Weixin login required before serve. Run `athlete weixin login` first.");
  }

  const client = new OpenILinkWeixinClient({
    token: credentials.token,
    baseUrl: credentials.baseUrl || options.config.weixin.baseUrl,
    cdnBaseUrl: credentials.cdnBaseUrl || options.config.weixin.cdnBaseUrl,
    routeTag: options.config.weixin.routeTag,
  });
  const syncBufStore = new FileWeixinSyncBufStore(options.config.weixin.syncBufFile);
  const contextTokenStore = new FileWeixinContextTokenStore(options.config.weixin.contextTokenFile);
  const deliveryQueue = new WeixinDeliveryQueue({
    storePath: options.config.weixin.deliveryQueueFile,
    target: client,
    contextTokenStore,
    deliveryConfig: options.config.weixin.delivery,
    onAccepted(entry) {
      logger.info("delivery sent", {
        peerKey: entry.peerKey,
        userId: entry.userId,
        fileName: entry.kind === "file" ? entry.fileName : undefined,
        detail: `type=${entry.kind}`,
      });
    },
    onDeliveryFailed(entry, error) {
      logger.error("delivery failed", {
        peerKey: entry.peerKey,
        userId: entry.userId,
        fileName: entry.kind === "file" ? entry.fileName : undefined,
        detail: getErrorMessage(error),
      });
    },
    onBlocked(entry, reason) {
      logger.info("delivery blocked", {
        peerKey: entry.peerKey,
        userId: entry.userId,
        fileName: entry.kind === "file" ? entry.fileName : undefined,
        detail: reason,
      });
    },
  });

  return new WeixinService({
    cwd: options.cwd,
    config: options.config,
    client,
    sessionStore: new SessionStore(options.config.paths.sessionsDir),
    sessionMapStore: new FileWeixinSessionMapStore(options.config.weixin.sessionMapFile),
    syncBufStore,
    contextTokenStore,
    attachmentStore: new FileWeixinAttachmentStore(options.config.weixin.attachmentStoreFile),
    deliveryQueue,
    pollingSource: new WeixinPollingSource(client, syncBufStore, options.config.weixin),
    logger,
  });
}

export function registerWeixinCommands(
  program: Command,
  dependencies: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    loginWeixin?: typeof loginWeixin;
    createWeixinService?: (options: {
      cwd: string;
      config: RuntimeConfig;
    }) => Promise<{
      run(signal?: AbortSignal): Promise<void>;
      stop?(): void;
    }>;
    logoutWeixin?: typeof logoutWeixin;
    acquireProcessLock?: (options: { stateDir: string }) => Promise<{
      pidFilePath: string;
      release(): Promise<void>;
    }>;
  },
): void {
  const weixinCommand = program.command("weixin").description("Serve Weixin private-chat control.");

  weixinCommand
    .command("login")
    .description("Login to Weixin with QR code and persist credentials.")
    .action(async () => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      await (dependencies.loginWeixin ?? loginWeixin)({
        cwd: runtime.cwd,
        config: runtime.config,
      });
    });

  weixinCommand
    .command("serve")
    .description("Run the Weixin private-chat service via long polling.")
    .action(async () => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      if (!runtime.config.weixin.credentials?.token) {
        throw new Error("Weixin login required before serve. Run `athlete weixin login` first.");
      }

      if (runtime.config.weixin.allowedUserIds.length === 0) {
        throw new Error("Weixin whitelist is empty. Set ATHLETE_WEIXIN_ALLOWED_USER_IDS or config.weixin.allowedUserIds.");
      }

      const acquireProcessLock =
        dependencies.acquireProcessLock ?? (await import("./processLock.js")).acquireWeixinProcessLock;
      const serviceFactory = dependencies.createWeixinService ?? createWeixinService;
      const lock = await acquireProcessLock({
        stateDir: runtime.config.weixin.stateDir,
      });
      const service = await serviceFactory({
        cwd: runtime.cwd,
        config: runtime.config,
      });
      console.log(
        `[weixin] starting private-chat service users=${runtime.config.weixin.allowedUserIds.join(",")} state=${runtime.config.weixin.stateDir}`,
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

  weixinCommand
    .command("logout")
    .description("Clear the persisted Weixin login state.")
    .action(async () => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      await (dependencies.logoutWeixin ?? logoutWeixin)({
        cwd: runtime.cwd,
        config: runtime.config,
      });
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
