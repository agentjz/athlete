import assert from "node:assert/strict";
import test from "node:test";

import { buildCompressedContextRequest } from "../../src/context/runtime/compression/builder.js";
import type { StoredMessage } from "../../src/types.js";

test("context compression keeps full current turn while under budget", () => {
  const messages: StoredMessage[] = [
    {
      role: "user",
      content: "show capabilities",
      createdAt: "2026-05-20T00:00:00.000Z",
    },
    ...Array.from({ length: 40 }, (_, index): StoredMessage => ({
      role: index % 2 === 0 ? "assistant" : "tool",
      name: index % 2 === 0 ? undefined : "read",
      content: `message ${index} ${"x".repeat(100)}`,
      createdAt: `2026-05-20T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
    })),
  ];

  const request = buildCompressedContextRequest(
    "system prompt",
    messages,
    {
      contextWindowMessages: 6,
      model: "deepseek-v4-flash",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  assert.equal(request.compressed, false);
  assert.equal(request.summary, undefined);
  assert.equal(request.messages.length, 1 + messages.length);
});
