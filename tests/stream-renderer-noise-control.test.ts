import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createStreamRenderer } from "../src/ui/streamRenderer.js";
import { captureStdout } from "./observability.helpers.js";

const REPO_ROOT = process.cwd();

test("stream renderer suppresses todo_write tool-call content preview while keeping summary", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolCall?.(
      "todo_write",
      JSON.stringify({
        items: [
          { id: "1", text: "line 1", status: "pending" },
          { id: "2", text: "line 2", status: "pending" },
          { id: "3", text: "line 3", status: "pending" },
          { id: "4", text: "line 4", status: "pending" },
        ],
      }),
    );
  });

  assert.match(output, /todo_write items=4/);
  assert.doesNotMatch(output, /\[content\]/);
  assert.doesNotMatch(output, /line 1|line 2|line 3|line 4/);
});

test("stream renderer keeps todo_write result previews as the only visible preview block", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolResult?.(
      "todo_write",
      JSON.stringify({
        preview: "[>] #1: Inspect\n[ ] #2: Report",
      }),
    );
  });

  assert.match(output, /\[result\] todo_write 成功/);
  assert.match(output, /\[preview\]/);
  assert.match(output, /\[>\] #1: Inspect/);
  assert.equal(countPreviewLines(output, "[preview]"), 2);
});

test("stream renderer shows dispatch receipts as real runtime events", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onDispatch?.({
      profile: "teammate",
      actorName: "teammate-task-1",
      executionId: "exec-1",
      taskId: 1,
      pid: 4321,
      summary: "role=implementer",
    });
  });

  assert.match(output, /\[dispatch\] teammate teammate-task-1 已启动 task=1 pid=4321 role=implementer/);
  assert.doesNotMatch(output, /\[tool\]|\[preview\]/);
});

test("stream renderer shows non-todo tool results as compact success receipts without previews", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    const noisyContent = Array.from({ length: 20 }, (_, index) => `line ${index + 1} ${"x".repeat(20)}`).join("\n");
    renderer.callbacks.onToolResult?.(
      "read_file",
      JSON.stringify({
        path: path.join(REPO_ROOT, "notes.txt"),
        content: noisyContent,
      }),
    );
  });

  assert.match(output, /\[result\] read_file notes\.txt 成功/);
  assert.doesNotMatch(output, /line 1|line 10/);
  assert.doesNotMatch(output, /\.\.\. \[truncated\]/);
  assert.equal(countPreviewLines(output, "[preview]"), 0);
});

test("stream renderer suppresses structured non-todo result previews", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolResult?.(
      "search_files",
      JSON.stringify({
        matches: [
          { path: path.join(REPO_ROOT, "a.ts"), line: 1, text: "first match" },
          { path: path.join(REPO_ROOT, "b.ts"), line: 2, text: "second match" },
          { path: path.join(REPO_ROOT, "c.ts"), line: 3, text: "third match" },
        ],
      }, null, 2),
    );
  });

  assert.match(output, /\[result\] search_files 成功/);
  assert.doesNotMatch(output, /matches|first match|second match/);
  assert.equal(countPreviewLines(output, "[preview]"), 0);
});
test("stream renderer shows failed structured results as one-line failure receipts", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolResult?.(
      "read_inbox",
      JSON.stringify({
        ok: false,
        error: `Loop guard blocked repeated calls. ${"x".repeat(300)}`,
        hint: "Choose a different route.",
      }),
    );
  });

  assert.match(output, /\[result\] read_inbox 失败/);
  assert.match(output, /Loop guard blocked/);
  assert.doesNotMatch(output, /\[preview\]/);
  assert.equal(countPreviewLines(output, "[preview]"), 0);
});

test("stream renderer shows tool errors as one-line failure receipts", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolError?.(
      "read_inbox",
      JSON.stringify({
        ok: false,
        error: `Loop guard blocked repeated calls. ${"x".repeat(300)}`,
        hint: "Choose a different route.",
      }),
    );
  });

  assert.match(output, /\[result\] read_inbox 失败/);
  assert.match(output, /Loop guard blocked/);
  assert.doesNotMatch(output, /\[preview\]/);
  assert.equal(countPreviewLines(output, "[preview]"), 0);
});

test("minimal terminal verbosity keeps tool result receipts without preview blocks", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "minimal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolResult?.(
      "list_files",
      JSON.stringify({
        entries: [
          { type: "file", path: path.join(REPO_ROOT, "a.txt") },
          { type: "file", path: path.join(REPO_ROOT, "b.txt") },
        ],
      }),
    );
  });

  assert.match(output, /\[result\] list_files 成功/);
  assert.doesNotMatch(output, /a\.txt|b\.txt/);
  assert.doesNotMatch(output, /\[preview\]/);
});

test("stream renderer marks externalized tool results as tracked", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolResult?.(
      "read_file",
      JSON.stringify({
        externalized: true,
        storagePath: ".deadmouse/tool-results/session/large.txt",
        preview: "large output head",
      }),
    );
  });

  assert.match(output, /\[result\] read_file 成功 tracked/);
  assert.doesNotMatch(output, /large output head/);
});

test("stream renderer suppresses non-todo tool-call previews", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolCall?.(
      "edit_file",
      JSON.stringify({
        path: path.join(REPO_ROOT, "notes.txt"),
        edits: [
          { old_string: "alpha old", new_string: "alpha new" },
          { old_string: "beta old", new_string: "beta new" },
        ],
      }),
    );
  });

  assert.match(output, /\[tool\] edit_file notes\.txt edits=2/);
  assert.doesNotMatch(output, /\[content\]/);
  assert.doesNotMatch(output, /alpha old|alpha new|\(1 more edit\(s\)\)/);
  assert.doesNotMatch(output, /beta old|beta new/);
});

test("stream renderer suppresses apply_patch call previews", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolCall?.(
      "apply_patch",
      JSON.stringify({
        patch: [
          "*** Begin Patch",
          "*** Update File: notes.txt",
          "@@",
          "-one",
          "+one updated",
          "-two",
          "+two updated",
          "-three",
          "+three updated",
          "*** End Patch",
        ].join("\n"),
      }),
    );
  });

  assert.match(output, /\[tool\] apply_patch/);
  assert.doesNotMatch(output, /\[content\]/);
  assert.doesNotMatch(output, /\*\*\* Begin Patch|\*\*\* Update File: notes\.txt/);
});

function countPreviewLines(output: string, label: "[content]" | "[preview]"): number {
  const normalizedOutput = stripAnsi(output);
  const marker = `${label}\n`;
  const markerIndex = normalizedOutput.indexOf(marker);
  if (markerIndex < 0) {
    return 0;
  }

  const previewText = normalizedOutput.slice(markerIndex + marker.length).trim();
  if (!previewText) {
    return 0;
  }

  return previewText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
