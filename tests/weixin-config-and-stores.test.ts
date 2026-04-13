import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDefaultConfig, resolveRuntimeConfig } from "../src/config/store.js";
import {
  FileWeixinCredentialStore,
  type WeixinLoginState,
} from "../src/weixin/credentialsStore.js";
import {
  FileWeixinContextTokenStore,
  type WeixinContextTokenRecord,
} from "../src/weixin/contextTokenStore.js";
import {
  DEFAULT_WEIXIN_CONFIG,
  normalizeWeixinConfig,
  parseWeixinAllowedUserIds,
} from "../src/weixin/config.js";
import { createConsoleWeixinLogger } from "../src/weixin/logger.js";
import {
  FileWeixinSessionMapStore,
  type WeixinSessionBinding,
} from "../src/weixin/sessionMapStore.js";
import { FileWeixinSyncBufStore } from "../src/weixin/syncBufStore.js";
import { createTempWorkspace } from "./helpers.js";

test("weixin config exposes formal defaults and normalizes overrides", () => {
  const defaults = getDefaultConfig().weixin;

  assert.equal(defaults.baseUrl, DEFAULT_WEIXIN_CONFIG.baseUrl);
  assert.equal(defaults.cdnBaseUrl, DEFAULT_WEIXIN_CONFIG.cdnBaseUrl);
  assert.deepEqual(defaults.allowedUserIds, []);
  assert.equal(defaults.polling.timeoutMs, 30_000);
  assert.equal(defaults.polling.retryBackoffMs, 1_000);
  assert.equal(defaults.messageChunkChars, 3_500);
  assert.equal(defaults.typingIntervalMs, 4_000);
  assert.equal(defaults.qrTimeoutMs, 480_000);
  assert.equal(defaults.delivery.baseDelayMs, 1_000);
  assert.equal(defaults.delivery.maxDelayMs, 30_000);
  assert.equal(defaults.delivery.receiptTimeoutMs, 5_000);

  const normalized = normalizeWeixinConfig({
    baseUrl: " https://weixin.example.test/ ",
    cdnBaseUrl: " https://cdn.weixin.example.test/c2c/ ",
    allowedUserIds: [" wxid_alice ", "", "wxid_bob", "wxid_alice"],
    polling: {
      timeoutMs: 10,
      retryBackoffMs: -1,
    },
    delivery: {
      maxRetries: 0,
      baseDelayMs: 100,
      maxDelayMs: 999_999,
      receiptTimeoutMs: 10,
    },
    messageChunkChars: 20,
    typingIntervalMs: 40,
    qrTimeoutMs: 1_000,
    routeTag: " route-a ",
  });

  assert.equal(normalized.baseUrl, "https://weixin.example.test");
  assert.equal(normalized.cdnBaseUrl, "https://cdn.weixin.example.test/c2c");
  assert.deepEqual(normalized.allowedUserIds, ["wxid_alice", "wxid_bob"]);
  assert.equal(normalized.polling.timeoutMs, 1_000);
  assert.equal(normalized.polling.retryBackoffMs, 250);
  assert.equal(normalized.delivery.maxRetries, 1);
  assert.equal(normalized.delivery.baseDelayMs, 250);
  assert.equal(normalized.delivery.maxDelayMs, 120_000);
  assert.equal(normalized.delivery.receiptTimeoutMs, 1_000);
  assert.equal(normalized.messageChunkChars, 128);
  assert.equal(normalized.typingIntervalMs, 500);
  assert.equal(normalized.qrTimeoutMs, 30_000);
  assert.equal(normalized.routeTag, "route-a");
});

test("weixin allowed user parser accepts comma-separated ids and drops invalid tokens", () => {
  assert.deepEqual(parseWeixinAllowedUserIds(undefined), []);
  assert.deepEqual(parseWeixinAllowedUserIds(""), []);
  assert.deepEqual(
    parseWeixinAllowedUserIds(" wxid_alice, ,wxid_bob,wxid_alice,\nwxid_carol "),
    ["wxid_alice", "wxid_bob", "wxid_carol"],
  );
});

test("resolveRuntimeConfig reads ATHLETE_WEIXIN_* from the project .env file", async (t) => {
  const root = await createTempWorkspace("weixin-config-env", t);
  await fs.mkdir(path.join(root, ".athlete"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".athlete", ".env"),
    [
      "ATHLETE_API_KEY=test-key",
      "ATHLETE_WEIXIN_ALLOWED_USER_IDS=wxid_alice,wxid_bob",
      "ATHLETE_WEIXIN_BASE_URL=https://weixin.example.test",
      "ATHLETE_WEIXIN_CDN_BASE_URL=https://cdn.weixin.example.test/c2c",
      "ATHLETE_WEIXIN_POLLING_TIMEOUT_MS=45000",
      "ATHLETE_WEIXIN_POLLING_RETRY_BACKOFF_MS=1500",
      "ATHLETE_WEIXIN_MESSAGE_CHUNK_CHARS=2048",
      "ATHLETE_WEIXIN_TYPING_INTERVAL_MS=3000",
      "ATHLETE_WEIXIN_QR_TIMEOUT_MS=120000",
      "ATHLETE_WEIXIN_DELIVERY_MAX_RETRIES=7",
      "ATHLETE_WEIXIN_DELIVERY_BASE_DELAY_MS=500",
      "ATHLETE_WEIXIN_DELIVERY_MAX_DELAY_MS=60000",
      "ATHLETE_WEIXIN_DELIVERY_RECEIPT_TIMEOUT_MS=8000",
      "ATHLETE_WEIXIN_ROUTE_TAG=athlete-route",
    ].join("\n"),
    "utf8",
  );
  const previous = snapshotEnv([
    "ATHLETE_API_KEY",
    "ATHLETE_WEIXIN_ALLOWED_USER_IDS",
    "ATHLETE_WEIXIN_BASE_URL",
    "ATHLETE_WEIXIN_CDN_BASE_URL",
    "ATHLETE_WEIXIN_POLLING_TIMEOUT_MS",
    "ATHLETE_WEIXIN_POLLING_RETRY_BACKOFF_MS",
    "ATHLETE_WEIXIN_MESSAGE_CHUNK_CHARS",
    "ATHLETE_WEIXIN_TYPING_INTERVAL_MS",
    "ATHLETE_WEIXIN_QR_TIMEOUT_MS",
    "ATHLETE_WEIXIN_DELIVERY_MAX_RETRIES",
    "ATHLETE_WEIXIN_DELIVERY_BASE_DELAY_MS",
    "ATHLETE_WEIXIN_DELIVERY_MAX_DELAY_MS",
    "ATHLETE_WEIXIN_DELIVERY_RECEIPT_TIMEOUT_MS",
    "ATHLETE_WEIXIN_ROUTE_TAG",
  ]);

  try {
    restoreEnv(
      Object.fromEntries(
        Object.keys(previous).map((key) => [key, undefined]),
      ),
    );

    const runtime = await resolveRuntimeConfig({
      cwd: root,
    });

    assert.equal(runtime.weixin.baseUrl, "https://weixin.example.test");
    assert.equal(runtime.weixin.cdnBaseUrl, "https://cdn.weixin.example.test/c2c");
    assert.deepEqual(runtime.weixin.allowedUserIds, ["wxid_alice", "wxid_bob"]);
    assert.equal(runtime.weixin.polling.timeoutMs, 45_000);
    assert.equal(runtime.weixin.polling.retryBackoffMs, 1_500);
    assert.equal(runtime.weixin.messageChunkChars, 2_048);
    assert.equal(runtime.weixin.typingIntervalMs, 3_000);
    assert.equal(runtime.weixin.qrTimeoutMs, 120_000);
    assert.equal(runtime.weixin.delivery.maxRetries, 7);
    assert.equal(runtime.weixin.delivery.baseDelayMs, 500);
    assert.equal(runtime.weixin.delivery.maxDelayMs, 60_000);
    assert.equal(runtime.weixin.delivery.receiptTimeoutMs, 8_000);
    assert.equal(runtime.weixin.routeTag, "athlete-route");
    assert.match(runtime.weixin.stateDir, /[\\/]\.athlete[\\/]weixin$/i);
    assert.match(runtime.weixin.credentialsFile, /credentials\.json$/i);
    assert.match(runtime.weixin.syncBufFile, /sync-buf\.json$/i);
    assert.equal(runtime.weixin.credentials, null);
  } finally {
    restoreEnv(previous);
  }
});

test("weixin credential store persists login state and clears it on logout", async (t) => {
  const root = await createTempWorkspace("weixin-credentials", t);
  const storePath = path.join(root, "credentials.json");
  const store = new FileWeixinCredentialStore(storePath);
  const state: WeixinLoginState = {
    token: "bot-token-123",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    botId: "bot-001",
    userId: "wxid_alice",
    connectedAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };

  assert.equal(await store.load(), null);

  await store.save(state);
  assert.deepEqual(await store.load(), state);

  const restored = new FileWeixinCredentialStore(storePath);
  assert.deepEqual(await restored.load(), state);

  await restored.clear();
  assert.equal(await restored.load(), null);
});

test("weixin sync buf store persists and restores the long-polling cursor", async (t) => {
  const root = await createTempWorkspace("weixin-sync-buf", t);
  const storePath = path.join(root, "sync-buf.json");
  const store = new FileWeixinSyncBufStore(storePath);

  assert.equal(await store.load(), null);

  await store.save("sync-buf-001");
  assert.equal(await store.load(), "sync-buf-001");

  const restored = new FileWeixinSyncBufStore(storePath);
  assert.equal(await restored.load(), "sync-buf-001");
});

test("weixin session map store persists and restores peer bindings", async (t) => {
  const root = await createTempWorkspace("weixin-session-map", t);
  const storePath = path.join(root, "session-map.json");
  const store = new FileWeixinSessionMapStore(storePath);
  const binding: WeixinSessionBinding = {
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    sessionId: "session-001",
    cwd: root,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };

  assert.equal(await store.get(binding.peerKey), null);

  await store.set(binding);

  assert.deepEqual(await store.get(binding.peerKey), binding);
  assert.deepEqual(await store.list(), [binding]);

  const restored = new FileWeixinSessionMapStore(storePath);
  assert.deepEqual(await restored.get(binding.peerKey), binding);
});

test("weixin context token store persists, updates, and invalidates tokens", async (t) => {
  const root = await createTempWorkspace("weixin-context-token", t);
  const storePath = path.join(root, "context-token.json");
  const store = new FileWeixinContextTokenStore(storePath);
  const record: WeixinContextTokenRecord = {
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-001",
    status: "active",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };

  assert.equal(await store.get(record.peerKey), null);
  assert.equal(await store.getUsableToken(record.peerKey), null);

  await store.set(record);
  assert.deepEqual(await store.get(record.peerKey), record);
  assert.equal(await store.getUsableToken(record.peerKey), "ctx-001");

  await store.set({
    ...record,
    contextToken: "ctx-002",
    updatedAt: "2026-04-07T00:01:00.000Z",
  });
  assert.equal(await store.getUsableToken(record.peerKey), "ctx-002");

  await store.markInvalid(record.peerKey, "context token expired");
  assert.equal(await store.getUsableToken(record.peerKey), null);
  assert.equal((await store.get(record.peerKey))?.status, "invalid");

  const restored = new FileWeixinContextTokenStore(storePath);
  assert.equal(await restored.getUsableToken(record.peerKey), null);
});

test("weixin stores keep JSON files human-readable on disk", async (t) => {
  const root = await createTempWorkspace("weixin-human-files", t);
  const credentialPath = path.join(root, "credentials.json");
  const syncBufPath = path.join(root, "sync-buf.json");
  const sessionMapPath = path.join(root, "session-map.json");
  const contextTokenPath = path.join(root, "context-token.json");
  const credentialStore = new FileWeixinCredentialStore(credentialPath);
  const syncBufStore = new FileWeixinSyncBufStore(syncBufPath);
  const sessionMapStore = new FileWeixinSessionMapStore(sessionMapPath);
  const contextTokenStore = new FileWeixinContextTokenStore(contextTokenPath);

  await credentialStore.save({
    token: "bot-token-123",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    botId: "bot-001",
    userId: "wxid_alice",
    connectedAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  });
  await syncBufStore.save("sync-buf-123");
  await sessionMapStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    sessionId: "session-001",
    cwd: root,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  });
  await contextTokenStore.set({
    peerKey: "weixin:private:wxid_alice",
    userId: "wxid_alice",
    contextToken: "ctx-001",
    status: "active",
    updatedAt: "2026-04-07T00:00:00.000Z",
  });

  for (const filePath of [credentialPath, syncBufPath, sessionMapPath, contextTokenPath]) {
    assert.match(await fs.readFile(filePath, "utf8"), /\n$/);
  }
});

test("weixin console logger prints operator-friendly status lines and trims reply previews", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  };

  try {
    const logger = createConsoleWeixinLogger();
    logger.info("received inbound message", {
      userId: "wxid_alice",
      inputKind: "voice",
    });
    logger.info("queued text reply", {
      userId: "wxid_alice",
      detail: `这是一段很长的微信回复预览 ${"B".repeat(120)} SHOULD_NOT_APPEAR`,
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? "", /\[weixin\]/);
  assert.match(lines[0] ?? "", /收到语音消息/);
  assert.doesNotMatch(lines[0] ?? "", /received inbound message/i);
  assert.match(lines[1] ?? "", /已排队文本回复/);
  assert.match(lines[1] ?? "", /preview=/);
  assert.doesNotMatch(lines[1] ?? "", /queued text reply/i);
  assert.doesNotMatch(lines[1] ?? "", /SHOULD_NOT_APPEAR/);
});

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}
