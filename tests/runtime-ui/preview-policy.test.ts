import assert from "node:assert/strict";
import test from "node:test";

import {
  createVisibleTurnCallbacks,
  type VisibleTurnEvent,
} from "../../src/runtime-ui/visibleEvents.js";
import { buildToolCallDisplay } from "../../src/runtime-ui/toolDisplay.js";
import { colorizeTodoMarkers } from "../../src/runtime-ui/todoStyling.js";
import {
  normalizeTerminalVerbosity,
  shouldShowToolCallPreview,
  shouldShowToolResultPreview,
  truncateBlock,
  truncateVisiblePreview,
} from "../../src/runtime-ui/previewPolicy.js";

test("runtime-ui preview policy keeps visible text bounded", () => {
  assert.equal(truncateVisiblePreview("  alpha\n beta  "), "alpha beta");
  assert.match(truncateBlock("a".repeat(300), 20), /\[truncated\]/);
  assert.equal(normalizeTerminalVerbosity(undefined), "normal");
  assert.equal(shouldShowToolCallPreview("read", "normal"), false);
  assert.equal(shouldShowToolResultPreview("read", "normal"), false);
  assert.equal(shouldShowToolResultPreview("todo_write", "normal"), true);
});

test("todo_write call display and visible events use checklist preview", () => {
  const callDisplay = buildToolCallDisplay("todo_write", JSON.stringify({
    items: [
      { id: "1", text: "Inspect history", status: "completed" },
      { id: "2", text: "Restore UI", status: "in_progress" },
    ],
  }), 160);
  assert.equal(callDisplay.summary, "todo_write items=2");

  const events: VisibleTurnEvent[] = [];
  const callbacks = createVisibleTurnCallbacks({
    onActivity: () => undefined,
    onVisibleEvent: (event) => events.push(event),
  });

  callbacks.onToolResult?.("todo_write", JSON.stringify({
    ok: true,
    preview: "[x] #1: Inspect history\n[>] #2: Restore UI\n- Progress: 1/2 completed",
  }));

  assert.deepEqual(events, [
    {
      kind: "todo_preview",
      text: "[x] #1: Inspect history\n[>] #2: Restore UI\n- Progress: 1/2 completed",
    },
  ]);
});

test("todo marker styling preserves visible checklist text", () => {
  const input = [
    "[ ] #1: pending task",
    "[>] #2: in progress task",
    "[x] #3: completed task",
    "- Progress: 1/3 completed",
  ].join("\n");

  assert.equal(stripAnsi(colorizeTodoMarkers(input)), input);
});

test("extension tool call display keeps summaries readable", () => {
  assert.equal(
    buildToolCallDisplay("http_request", JSON.stringify({
      method: "post",
      url: "/items",
      session_id: "local",
      headers: { authorization: "secret" },
      body: "x".repeat(500),
    }), 80).summary,
    "http_request POST /items session=local",
  );
  assert.equal(
    buildToolCallDisplay("download_url", JSON.stringify({
      url: "https://example.com/file.txt",
      path: "tmp/file.txt",
    }), 80, "C:\\repo").summary,
    "download_url https://example.com/file.txt -> tmp/file.txt",
  );
  assert.equal(
    buildToolCallDisplay("worktree_create", JSON.stringify({
      path: "C:\\repo-worktree",
      branch: "feature/agent",
    }), 80, "C:\\repo").summary,
    "worktree_create C:\\repo-worktree branch=feature/agent",
  );
  assert.equal(
    buildToolCallDisplay("spec_task_update", JSON.stringify({
      task_id: "T01",
      text: "Update design",
      status: "completed",
    }), 80).summary,
    "spec_task_update task=T01",
  );
});

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
