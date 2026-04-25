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

test("stream renderer shows non-todo tool results as success plus one short preview", async () => {
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

  assert.match(output, /\[result\] read_file notes\.txt success/);
  assert.match(output, /line 1/);
  assert.doesNotMatch(output, /line 10/);
  assert.doesNotMatch(output, /\.\.\. \[truncated\]/);
  assert.equal(countPreviewLines(output, "[preview]"), 1);
});

test("stream renderer uses one generic short preview for structured match results", async () => {
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

  assert.match(output, /\[result\] search_files success/);
  assert.match(output, /matches/);
  assert.equal(countPreviewLines(output, "[preview]"), 1);
});
test("stream renderer shows failed structured results as fail plus one short preview", async () => {
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

  assert.match(output, /\[result\] read_inbox fail/);
  assert.match(output, /Loop guard blocked/);
  assert.doesNotMatch(output, /Choose a different route/);
  assert.equal(countPreviewLines(output, "[preview]"), 1);
});

test("stream renderer shows tool errors as fail receipts with short previews", async () => {
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

  assert.match(output, /\[result\] read_inbox fail/);
  assert.match(output, /Loop guard blocked/);
  assert.doesNotMatch(output, /Choose a different route/);
  assert.equal(countPreviewLines(output, "[preview]"), 1);
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

  assert.match(output, /list_files success/);
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

  assert.match(output, /\[result\] read_file success tracked/);
  assert.match(output, /large output head/);
});

test("stream renderer compacts edit_file call previews to first edit plus remainder count", async () => {
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

  assert.match(output, /alpha old/);
  assert.match(output, /alpha new/);
  assert.match(output, /\(1 more edit\(s\)\)/);
  assert.doesNotMatch(output, /beta old|beta new/);
});

test("stream renderer compacts apply_patch call previews to head lines with remainder count", async () => {
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

  assert.match(output, /\*\*\* Begin Patch/);
  assert.match(output, /\*\*\* Update File: notes\.txt/);
  assert.match(output, /\.\.\. \(\d+ more line\(s\)\)/);
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
