import assert from "node:assert/strict";
import test from "node:test";

import { TelegramTurnDisplay } from "../../src/telegram/turnDisplay.js";

test("telegram turn display emits assistant and todo previews while hiding generic tool previews", async () => {
  const messages: string[] = [];
  const display = new TelegramTurnDisplay({
    chatId: 42,
    sendTyping: async () => undefined,
    enqueueVisibleMessage: async (_target, text) => {
      messages.push(text);
    },
    typingIntervalMs: 60_000,
    scheduleTypingTick: () => ({ cancel: () => undefined }),
  });

  display.callbacks.onAssistantStage?.("Working\n");
  display.callbacks.onToolResult?.("read", JSON.stringify({ preview: "hidden read preview" }));
  display.callbacks.onToolResult?.("todo_write", JSON.stringify({
    preview: "[>] #1: Restore todo UI\n- Progress: 0/1 completed",
  }));

  await display.flush();

  assert.deepEqual(messages, [
    "Working\n",
    "[>] #1: Restore todo UI\n- Progress: 0/1 completed",
  ]);
});
