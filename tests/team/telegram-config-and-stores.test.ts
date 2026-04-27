import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDefaultConfig, resolveRuntimeConfig } from "../../src/config/store.js";
import {
  normalizeTelegramConfig,
  parseTelegramAllowedUserIds,
} from "../../src/telegram/config.js";
import { createConsoleTelegramLogger } from "../../src/telegram/logger.js";
import { chunkTelegramMessage } from "../../src/telegram/messageChunking.js";
import { FileTelegramOffsetStore } from "../../src/telegram/offsetStore.js";
import {
  FileTelegramSessionMapStore,
  type TelegramSessionBinding,
} from "../../src/telegram/sessionMapStore.js";
import { applyTelegramProxyEnvironment } from "../../src/telegram/proxy.js";
import { classifyTelegramUpdate } from "../../src/telegram/updateFilter.js";
import type { TelegramUpdate } from "../../src/telegram/types.js";
import { createTempWorkspace } from "../helpers.js";

function createPrivateMessageUpdate(
  overrides: {
    updateId?: number;
    userId?: number;
    chatId?: number;
    text?: string;
    chatType?: "private" | "group" | "supergroup" | "channel";
  } = {},
): TelegramUpdate {
  return {
    update_id: overrides.updateId ?? 1,
    message: {
      message_id: 7,
      date: 0,
      text: overrides.text ?? "hello deadmouse",
      from: {
        id: overrides.userId ?? 1001,
        is_bot: false,
        first_name: "Test",
      },
      chat: {
        id: overrides.chatId ?? 2001,
        type: overrides.chatType ?? "private",
      },
    },
  };
}

test("telegram config exposes formal defaults and normalizes overrides", () => {
  const defaults = getDefaultConfig().telegram;

  assert.equal(defaults.apiBaseUrl, "https://api.telegram.org");
  assert.equal(defaults.proxyUrl, "");
  assert.deepEqual(defaults.allowedUserIds, []);
  assert.equal(defaults.polling.timeoutSeconds, 50);
  assert.equal(defaults.polling.limit, 100);
  assert.equal(defaults.messageChunkChars, 3500);
  assert.equal(defaults.typingIntervalMs, 4000);
  assert.equal(defaults.delivery.baseDelayMs, 1000);
  assert.equal(defaults.delivery.maxDelayMs, 30000);

  const normalized = normalizeTelegramConfig({
    token: " 123:abc ",
    apiBaseUrl: "https://telegram.example.test/",
    proxyUrl: " http://127.0.0.1:7897/ ",
    allowedUserIds: [1001, Number.NaN as unknown as number, 1002],
    polling: {
      timeoutSeconds: 0,
      limit: 999,
      retryBackoffMs: 1000,
    },
    delivery: {
      maxRetries: 0,
      baseDelayMs: -1,
      maxDelayMs: 999999,
    },
    messageChunkChars: 20,
    typingIntervalMs: 40,
  });

  assert.equal(normalized.token, "123:abc");
  assert.equal(normalized.apiBaseUrl, "https://telegram.example.test");
  assert.equal(normalized.proxyUrl, "http://127.0.0.1:7897");
  assert.deepEqual(normalized.allowedUserIds, [1001, 1002]);
  assert.equal(normalized.polling.timeoutSeconds, 1);
  assert.equal(normalized.polling.limit, 100);
  assert.equal(normalized.delivery.maxRetries, 1);
  assert.equal(normalized.delivery.baseDelayMs, 250);
  assert.equal(normalized.delivery.maxDelayMs, 120000);
  assert.equal(normalized.messageChunkChars, 128);
  assert.equal(normalized.typingIntervalMs, 500);
});

test("telegram allowed user parser accepts comma-separated ids and drops invalid tokens", () => {
  assert.deepEqual(parseTelegramAllowedUserIds(undefined), []);
  assert.deepEqual(parseTelegramAllowedUserIds(""), []);
  assert.deepEqual(parseTelegramAllowedUserIds("1001, 1002, nope, 1001, -4"), [1001, 1002]);
});

test("telegram update filter accepts only authorized private chats", () => {
  const accepted = classifyTelegramUpdate(createPrivateMessageUpdate(), {
    allowedUserIds: [1001],
  });
  assert.equal(accepted.kind, "private_message");
  assert.equal(accepted.userId, 1001);
  assert.equal(accepted.chatId, 2001);
  assert.equal(accepted.peerKey, "telegram:private:2001");
  assert.equal(accepted.text, "hello deadmouse");

  const unauthorized = classifyTelegramUpdate(createPrivateMessageUpdate(), {
    allowedUserIds: [2002],
  });
  assert.equal(unauthorized.kind, "ignore");
  assert.equal(unauthorized.reason, "unauthorized_user");

  const group = classifyTelegramUpdate(
    createPrivateMessageUpdate({
      chatType: "group",
    }),
    {
      allowedUserIds: [1001],
    },
  );
  assert.equal(group.kind, "ignore");
  assert.equal(group.reason, "non_private_chat");

  const unsupported = classifyTelegramUpdate(
    {
      update_id: 99,
      edited_message: createPrivateMessageUpdate().message,
    },
    {
      allowedUserIds: [1001],
    },
  );
  assert.equal(unsupported.kind, "ignore");
  assert.equal(unsupported.reason, "unsupported_update");
});

test("telegram offset store persists and restores the long-polling cursor", async (t) => {
  const root = await createTempWorkspace("telegram-offset", t);
  const storePath = path.join(root, "offset.json");
  const store = new FileTelegramOffsetStore(storePath);

  assert.equal(await store.load(), null);

  await store.save(42);
  assert.equal(await store.load(), 42);

  const restored = new FileTelegramOffsetStore(storePath);
  assert.equal(await restored.load(), 42);
});

test("telegram session map store persists and restores telegram-to-session bindings", async (t) => {
  const root = await createTempWorkspace("telegram-session-map", t);
  const storePath = path.join(root, "session-map.json");
  const store = new FileTelegramSessionMapStore(storePath);
  const binding: TelegramSessionBinding = {
    peerKey: "telegram:private:2001",
    userId: 1001,
    chatId: 2001,
    sessionId: "session-001",
    cwd: root,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
  };

  assert.equal(await store.get(binding.peerKey), null);

  await store.set(binding);

  assert.deepEqual(await store.get(binding.peerKey), binding);
  assert.deepEqual(await store.list(), [binding]);

  const restored = new FileTelegramSessionMapStore(storePath);
  assert.deepEqual(await restored.get(binding.peerKey), binding);
});

test("telegram message chunking splits oversized replies without losing content", () => {
  const text = [
    "Deadmouse can now stream results back to Telegram.",
    "",
    "This paragraph is intentionally long so that the chunker has to split on whitespace instead of chopping in the middle of a word.",
    "",
    "Final line.",
  ].join("\n");

  const chunks = chunkTelegramMessage(text, 45);

  assert.equal(chunks.length > 2, true);
  for (const chunk of chunks) {
    assert.equal(chunk.length <= 45, true);
  }
  assert.equal(chunks.join(""), text);
});

test("telegram stores keep JSON files human-readable on disk", async (t) => {
  const root = await createTempWorkspace("telegram-human-files", t);
  const offsetPath = path.join(root, "offset.json");
  const sessionMapPath = path.join(root, "session-map.json");
  const offsetStore = new FileTelegramOffsetStore(offsetPath);
  const sessionMapStore = new FileTelegramSessionMapStore(sessionMapPath);

  await offsetStore.save(11);
  await sessionMapStore.set({
    peerKey: "telegram:private:3001",
    userId: 3001,
    chatId: 3001,
    sessionId: "session-3001",
    cwd: root,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
  });

  assert.match(await fs.readFile(offsetPath, "utf8"), /\n$/);
  assert.match(await fs.readFile(sessionMapPath, "utf8"), /\n$/);
});

test("telegram proxy helper turns a local proxy entry into Node proxy environment variables", () => {
  const previous = {
    NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
  };

  try {
    delete process.env.NODE_USE_ENV_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;

    applyTelegramProxyEnvironment("http://127.0.0.1:7897");

    assert.equal(process.env.NODE_USE_ENV_PROXY, "1");
    assert.equal(process.env.HTTPS_PROXY, "http://127.0.0.1:7897");
    assert.equal(process.env.HTTP_PROXY, "http://127.0.0.1:7897");
  } finally {
    restoreEnv(previous);
  }
});

test("telegram console logger prints operator-friendly status lines and trims reply previews", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  };

  try {
    const logger = createConsoleTelegramLogger();
    logger.info("received inbound message", {
      userId: 1001,
      chatId: 2001,
      inputKind: "text",
    });
    logger.info("queued text reply", {
      chatId: 2001,
      detail: `This is a very long reply preview ${"A".repeat(120)} SHOULD_NOT_APPEAR`,
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? "", /\[telegram\]/);
  assert.match(lines[0] ?? "", /received text message/);
  assert.doesNotMatch(lines[0] ?? "", /received inbound message/i);
  assert.match(lines[1] ?? "", /queued text reply/);
  assert.match(lines[1] ?? "", /preview=/);
  assert.doesNotMatch(lines[1] ?? "", /SHOULD_NOT_APPEAR/);
  assert.doesNotMatch(lines[1] ?? "", /SHOULD_NOT_APPEAR/);
});

test("resolveRuntimeConfig reads DEADMOUSE_TELEGRAM_PROXY_URL from the project .env file", async (t) => {
  const root = await createTempWorkspace("telegram-proxy-env", t);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_API_KEY=test-key",
      "DEADMOUSE_TELEGRAM_TOKEN=test-telegram-token",
      "DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS=1001",
      "DEADMOUSE_TELEGRAM_PROXY_URL=http://127.0.0.1:7897",
    ].join("\n"),
    "utf8",
  );
  const previous = {
    DEADMOUSE_API_KEY: process.env.DEADMOUSE_API_KEY,
    DEADMOUSE_TELEGRAM_TOKEN: process.env.DEADMOUSE_TELEGRAM_TOKEN,
    DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS: process.env.DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS,
    DEADMOUSE_TELEGRAM_PROXY_URL: process.env.DEADMOUSE_TELEGRAM_PROXY_URL,
  };

  try {
    delete process.env.DEADMOUSE_API_KEY;
    delete process.env.DEADMOUSE_TELEGRAM_TOKEN;
    delete process.env.DEADMOUSE_TELEGRAM_ALLOWED_USER_IDS;
    delete process.env.DEADMOUSE_TELEGRAM_PROXY_URL;

    const runtime = await resolveRuntimeConfig({
      cwd: root,
    });

    assert.equal(runtime.telegram.proxyUrl, "http://127.0.0.1:7897");
  } finally {
    restoreEnv(previous);
  }
});

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}
