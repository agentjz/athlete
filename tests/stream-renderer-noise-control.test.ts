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
        toolErrorLabel: "failed",
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

test("stream renderer limits read_file result preview to three lines", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
        toolErrorLabel: "failed",
      },
    );

    renderer.callbacks.onToolResult?.(
      "read_file",
      JSON.stringify({
        path: path.join(REPO_ROOT, "notes.txt"),
        content: "line 1\nline 2\nline 3\nline 4",
      }),
    );
  });

  assert.match(output, /line 1/);
  assert.match(output, /line 2/);
  assert.match(output, /line 3/);
  assert.doesNotMatch(output, /line 4/);
  assert.match(output, /\.\.\. \[truncated\]/);
  assert.equal(countPreviewLines(output, "[preview]"), 3);
});

test("minimal terminal verbosity keeps read previews but hides unrelated tool previews", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "minimal" },
      {
        cwd: REPO_ROOT,
        toolErrorLabel: "failed",
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
    renderer.callbacks.onToolResult?.(
      "read_file",
      JSON.stringify({
        path: path.join(REPO_ROOT, "notes.txt"),
        content: "line 1\nline 2\nline 3\nline 4",
      }),
    );
  });

  assert.match(output, /list_files/);
  assert.doesNotMatch(output, /a\.txt|b\.txt/);
  assert.match(output, /line 1/);
  assert.match(output, /line 2/);
  assert.match(output, /line 3/);
  assert.doesNotMatch(output, /line 4/);
  assert.doesNotMatch(output, /\[preview\]/);
});

test("stream renderer compacts edit_file call previews to first edit plus remainder count", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      { showReasoning: false, terminalVerbosity: "normal" },
      {
        cwd: REPO_ROOT,
        toolErrorLabel: "failed",
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
        toolErrorLabel: "failed",
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
  const marker = `${label}\n`;
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0) {
    return 0;
  }

  const previewText = output.slice(markerIndex + marker.length).trim();
  if (!previewText) {
    return 0;
  }

  return previewText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}
