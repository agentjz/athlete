import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionConversationBrief,
  buildSessionConversationBriefBlock,
} from "../../src/agent/contextRuntime/sessionBrief/index.js";
import { createMessage, createToolMessage } from "../../src/agent/session.js";

test("session conversation brief keeps same-session conversational continuity short and visible", () => {
  const brief = buildSessionConversationBrief({
    messages: [
      createMessage("user", "你好，你好"),
      createMessage("assistant", "你好，有什么我可以帮你？"),
      createMessage("user", "你知不知道我们上一轮对话是什么"),
      createMessage("assistant", "我不会自动携带旧 session 原文，但可以查历史。"),
      createMessage("user", "请问你有什么能力"),
      createMessage("assistant", "我可以查代码、改文件、跑测试。"),
      createMessage("user", "当前这一轮的上下文是什么"),
    ],
    timestamp: "2026-05-03T00:00:00.000Z",
  });
  const block = buildSessionConversationBriefBlock(brief) ?? "";

  assert.equal(brief?.userTurnCount, 4);
  assert.equal(brief?.assistantTurnCount, 3);
  assert.match(brief?.signals.openQuestions.join("\n") ?? "", /当前这一轮的上下文是什么/);
  assert.match(block, /Current session conversation brief:/);
  assert.match(block, /Answer direct questions about this same session's recent conversation/i);
  assert.match(block, /Briefed turns: 4 user turn\(s\).*3 assistant response\(s\)/);
  assert.match(block, /你好，你好/);
  assert.match(block, /请问你有什么能力/);
  assert.match(block, /当前这一轮的上下文是什么/);
});

test("session conversation brief excludes tool payloads and internal wake messages", () => {
  const brief = buildSessionConversationBrief({
    messages: [
      createMessage("user", "先聊一下当前会话连续性"),
      createMessage("user", "[internal] Continue from checkpoint."),
      createMessage("assistant", null, {
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "read_file",
              arguments: "{}",
            },
          },
        ],
      }),
      createToolMessage("tool-1", "VERY LARGE TOOL PAYLOAD SHOULD NOT ENTER SESSION BRIEF", "read_file"),
      createMessage("assistant", "我已经读取了文件。"),
    ],
  });
  const block = buildSessionConversationBriefBlock(brief) ?? "";

  assert.match(block, /user: 先聊一下当前会话连续性/);
  assert.match(block, /assistant: called tools: read_file/);
  assert.match(block, /assistant: 我已经读取了文件。/);
  assert.doesNotMatch(block, /VERY LARGE TOOL PAYLOAD/);
  assert.doesNotMatch(block, /Continue from checkpoint/);
});

test("session conversation brief counts but omits oversized same-session turns", () => {
  const brief = buildSessionConversationBrief({
    messages: [
      createMessage("user", `old large user turn ${"U".repeat(1_200)}`),
      createMessage("assistant", `old large assistant turn ${"A".repeat(1_200)}`),
      createMessage("user", "现在我们在同一个 session 里继续聊"),
      createMessage("assistant", "可以，我会接住当前 session 的近期脉络。"),
      createMessage("user", "刚才我们聊到了哪里"),
    ],
  });
  const block = buildSessionConversationBriefBlock(brief) ?? "";

  assert.equal(brief?.userTurnCount, 2);
  assert.equal(brief?.assistantTurnCount, 1);
  assert.equal(brief?.omittedLongTurnCount, 2);
  assert.match(block, /Briefed turns: 2 user turn\(s\).*1 assistant response\(s\)/);
  assert.match(block, /Omitted long turns: 2 earlier visible turn\(s\)/);
  assert.match(block, /现在我们在同一个 session 里继续聊/);
  assert.match(block, /刚才我们聊到了哪里/);
  assert.doesNotMatch(block, /old large user turn/);
  assert.doesNotMatch(block, /old large assistant turn/);
});

test("session conversation brief compresses same-session turns into reviewable signals", () => {
  const brief = buildSessionConversationBrief({
    messages: [
      createMessage("user", "确认需求：同一个 session 里面不要每句话都像新开局。"),
      createMessage("assistant", "我会把同 session 对话脉络作为短简报注入。"),
      createMessage("user", "原则：长期记忆暂时不需要，历史只做证据库。"),
      createMessage("assistant", null, {
        toolCalls: [
          {
            id: "tool-2",
            type: "function",
            function: {
              name: "session_search",
              arguments: "{}",
            },
          },
        ],
      }),
      createMessage("user", "下一步请补智能压缩，并跑真实 API 记忆测试。"),
      createMessage("user", "你觉得还有没有没有对标好的地方？"),
    ],
  });
  const block = buildSessionConversationBriefBlock(brief) ?? "";

  assert.match(block, /Confirmed facts: .*同一个 session/);
  assert.match(block, /Decisions: .*长期记忆暂时不需要/);
  assert.match(block, /Next signals: .*补智能压缩/);
  assert.match(block, /Tool activity: called tools: session_search/);
  assert.match(block, /Open questions: .*没有对标好的地方/);
});
