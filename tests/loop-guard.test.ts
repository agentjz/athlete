import assert from "node:assert/strict";
import test from "node:test";

import { DelegatedWaitRhythmGuard, ToolLoopGuard } from "../src/agent/turn.js";
import type { SessionRecord, ToolCallRecord, ToolExecutionResult } from "../src/types.js";

test("loop guard blocks a repeated static action only after identical observations", () => {
  const loopGuard = new ToolLoopGuard();
  const toolCall = createToolCall("read_file", { path: "README.md" });
  const result = okResult({ ok: true, content: "same content" });

  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
  assert.equal(loopGuard.noteToolResult(toolCall, result), null);
  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
  assert.equal(loopGuard.noteToolResult(toolCall, result), null);
  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);

  const blocked = loopGuard.noteToolResult(toolCall, result);
  assert.ok(blocked);
  assert.match(String(blocked.output), /Loop guard blocked repeated read_file calls/i);
  assert.match(String(blocked.output), /same result/i);
});

test("loop guard treats changed observations as progress for the same action", () => {
  const loopGuard = new ToolLoopGuard();
  const toolCall = createToolCall("read_file", { path: "README.md" });

  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
  assert.equal(loopGuard.noteToolResult(toolCall, okResult({ ok: true, content: "version one" })), null);
  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
  assert.equal(loopGuard.noteToolResult(toolCall, okResult({ ok: true, content: "version two" })), null);
  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
  assert.equal(loopGuard.noteToolResult(toolCall, okResult({ ok: true, content: "version three" })), null);

  assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null);
});

test("loop guard does not preflight-block volatile state polling tools", () => {
  for (const toolName of ["read_inbox", "list_teammates", "background_check", "task_list", "worktree_events", "shutdown_response"]) {
    const loopGuard = new ToolLoopGuard();
    const toolCall = createToolCall(toolName, toolName === "shutdown_response" ? { request_id: "req-1" } : {});
    const unchanged = okResult({ ok: true, preview: "state unchanged" });

    for (let index = 0; index < 5; index += 1) {
      assert.equal(loopGuard.getPreflightBlockedResult(toolCall), null, `${toolName} should stay pollable`);
      assert.equal(loopGuard.noteToolResult(toolCall, unchanged), null);
    }
  }
});

test("delegated wait rhythm requires lead-side work between status polls", () => {
  const session = createSessionWithDelegatedWaitPoll();
  const guard = new DelegatedWaitRhythmGuard(session);

  const blocked = guard.getPreflightBlockedResult(createToolCall("background_check", { job_id: "job-1" }));
  assert.ok(blocked);
  assert.match(blocked.output, /DELEGATED_WAIT_LEAD_WORK_REQUIRED/);

  const taskList = createToolCall("task_list", {});
  assert.equal(guard.getPreflightBlockedResult(taskList), null);
  guard.noteAcceptedToolBatch([taskList]);
  assert.ok(guard.getPreflightBlockedResult(createToolCall("list_teammates", {})));

  const readFile = createToolCall("read_file", { path: "README.md" });
  assert.equal(guard.getPreflightBlockedResult(readFile), null);
  guard.noteAcceptedToolBatch([readFile]);

  assert.equal(
    guard.getPreflightBlockedResult(createToolCall("background_check", { job_id: "job-1" })),
    null,
  );
});

test("delegated wait rhythm allows one coordination batch before requiring lead-side work", () => {
  const session = createSessionWithDelegatedWaitMarkerOnly();
  const guard = new DelegatedWaitRhythmGuard(session);

  const teammatePoll = createToolCall("list_teammates", {});
  const inboxPoll = createToolCall("read_inbox", {});
  assert.equal(guard.getPreflightBlockedResult(teammatePoll), null);
  assert.equal(guard.getPreflightBlockedResult(inboxPoll), null);

  guard.noteAcceptedToolBatch([teammatePoll, inboxPoll]);

  const blocked = guard.getPreflightBlockedResult(createToolCall("read_inbox", {}));
  assert.ok(blocked);
  assert.match(blocked.output, /DELEGATED_WAIT_LEAD_WORK_REQUIRED/);
});

function createToolCall(name: string, args: Record<string, unknown>): ToolCallRecord {
  return {
    id: `call-${name}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

function okResult(payload: Record<string, unknown>): ToolExecutionResult {
  return {
    ok: true,
    output: JSON.stringify(payload, null, 2),
  };
}

function createSessionWithDelegatedWaitPoll(): SessionRecord {
  return {
    id: "session-delegated-wait",
    cwd: process.cwd(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 2,
    messages: [
      {
        role: "user",
        content: "[internal] Active delegated work is still running; do not wait idly.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        role: "tool",
        name: "background_check",
        content: JSON.stringify({ ok: true, status: "running" }),
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ],
  } as SessionRecord;
}

function createSessionWithDelegatedWaitMarkerOnly(): SessionRecord {
  return {
    id: "session-delegated-wait-marker",
    cwd: process.cwd(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 1,
    messages: [
      {
        role: "user",
        content: "[internal] Active delegated work is still running; do not wait idly.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } as SessionRecord;
}
