import assert from "node:assert/strict";
import test from "node:test";

import { chunkTelegramMessage } from "../../src/telegram/messageChunking.js";
import type { TelegramDocument, TelegramUpdate } from "../../src/telegram/types.js";
import { classifyTelegramUpdate } from "../../src/telegram/updateFilter.js";

test("telegram message chunking prefers paragraph, line, and word boundaries", () => {
  assert.deepEqual(chunkTelegramMessage("", 10), []);
  assert.deepEqual(chunkTelegramMessage("short", 10), ["short"]);
  assert.deepEqual(chunkTelegramMessage("alpha beta gamma", 11), ["alpha beta ", "gamma"]);
  assert.deepEqual(chunkTelegramMessage("alpha\nbeta\ngamma", 11), ["alpha\nbeta\n", "gamma"]);
  assert.deepEqual(chunkTelegramMessage("abcdefghijk", 4), ["abcd", "efgh", "ijk"]);
});

test("telegram update classifier accepts authorized private text and files", () => {
  const message = classifyTelegramUpdate(createUpdate({ text: "  hello  " }), {
    allowedUserIds: [42],
  });
  assert.equal(message.kind, "private_message");
  if (message.kind === "private_message") {
    assert.equal(message.peerKey, "telegram:private:100");
    assert.equal(message.text, "hello");
  }

  const file = classifyTelegramUpdate(createUpdate({
    caption: " spec ",
    document: {
      file_id: "file-id",
      file_unique_id: "file-unique-id",
      file_name: "spec.md",
    },
  }), { allowedUserIds: [42] });
  assert.equal(file.kind, "private_file_message");
  if (file.kind === "private_file_message") {
    assert.equal(file.text, "spec");
    assert.equal(file.fileName, "spec.md");
  }
});

test("telegram update classifier records ignored update reasons", () => {
  assertIgnoredReason(
    classifyTelegramUpdate({ update_id: 1 }, { allowedUserIds: [42] }),
    "unsupported_update",
  );
  assertIgnoredReason(
    classifyTelegramUpdate(createUpdate({ chatType: "group" }), { allowedUserIds: [42] }),
    "non_private_chat",
  );
  assertIgnoredReason(
    classifyTelegramUpdate(createUpdate({ fromId: 99 }), { allowedUserIds: [42] }),
    "unauthorized_user",
  );
  assertIgnoredReason(
    classifyTelegramUpdate(createUpdate({ text: "   " }), { allowedUserIds: [42] }),
    "empty_message",
  );
});

function assertIgnoredReason(
  update: ReturnType<typeof classifyTelegramUpdate>,
  reason: "unsupported_update" | "non_private_chat" | "unauthorized_user" | "empty_message",
): void {
  assert.equal(update.kind, "ignore");
  if (update.kind === "ignore") {
    assert.equal(update.reason, reason);
  }
}

function createUpdate(options: {
  text?: string;
  caption?: string;
  chatType?: "private" | "group" | "supergroup" | "channel";
  fromId?: number;
  document?: TelegramDocument;
} = {}): TelegramUpdate {
  return {
    update_id: 10,
    message: {
      message_id: 20,
      date: 1,
      chat: {
        id: 100,
        type: options.chatType ?? "private",
      },
      from: {
        id: options.fromId ?? 42,
        is_bot: false,
        first_name: "Tester",
      },
      text: options.text,
      caption: options.caption,
      document: options.document,
    },
  };
}
