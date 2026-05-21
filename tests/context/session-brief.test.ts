import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionConversationBrief,
  buildSessionConversationBriefBlock,
} from "../../src/context/runtime/sessionBrief/build.js";
import type { StoredMessage } from "../../src/types.js";

test("session brief preserves recent turns without semantic labels", () => {
  const messages: StoredMessage[] = [
    {
      role: "assistant",
      content: "最简单的 Node.js 原生方案是 Eleventy (11ty)，用 npx @11ty/eleventy --serve 本地预览。",
      createdAt: "2026-05-21T10:00:00.000Z",
    },
    {
      role: "user",
      content: "OK",
      createdAt: "2026-05-21T10:00:03.000Z",
    },
  ];

  const block = buildSessionConversationBriefBlock(buildSessionConversationBrief({
    messages,
    timestamp: "2026-05-21T10:00:04.000Z",
  }));

  assert.doesNotMatch(block ?? "", /Confirmed facts/);
  assert.doesNotMatch(block ?? "", /Decisions/);
  assert.doesNotMatch(block ?? "", /Open questions/);
  assert.doesNotMatch(block ?? "", /Next signals/);
  assert.match(block ?? "", /assistant: 最简单的 Node\.js 原生方案是 Eleventy/);
  assert.match(block ?? "", /user: OK/);
});
