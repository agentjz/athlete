import assert from "node:assert/strict";
import test from "node:test";

import { ToolLoopGuard } from "../src/agent/turn.js";
import type { ToolCallRecord, ToolExecutionResult } from "../src/types.js";

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
