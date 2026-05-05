import assert from "node:assert/strict";
import test from "node:test";

import { buildContextRuntimeRequest } from "../../src/agent/contextRuntime/request.js";
import { createMessage } from "../../src/agent/session/messages.js";
import { createTestRuntimeConfig } from "./helpers.js";

test("context compression keeps long turns runnable", () => {
  const root = process.cwd();
  const config = {
    ...createTestRuntimeConfig(root),
    contextWindowMessages: 40,
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  };
  const largeContent = "0123456789 ".repeat(1_000);
  const messages = [
    createMessage("user", "Keep working on the current coding task."),
    ...Array.from({ length: 24 }, (_, index) =>
      createMessage(index % 2 === 0 ? "assistant" : "user", `${index}: ${largeContent}`),
    ),
  ];

  const request = buildContextRuntimeRequest({
    prompt: "You are Kitty.",
    session: {
      messages,
    },
    config,
  });

  assert.equal(request.compressed, true);
  assert.ok(request.messages.length > 1);
  assert.equal(request.messages[0]?.role, "system");
  assert.ok(request.estimatedChars > 0);
  assert.ok(request.messages.length < messages.length + 1);
});
