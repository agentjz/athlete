import assert from "node:assert/strict";
import test from "node:test";

import type { ShellOutputPort } from "../../src/interaction/shell.js";
import { writeCliInteractiveIntro } from "../../src/shell/cli/intro.js";

test("interactive intro prints session, cwd, and local commands", () => {
  const output = createRecordingOutput();

  writeCliInteractiveIntro({
    cwd: "C:\\workspace\\kitty",
    session: { id: "session-intro" },
    output,
  });

  const rendered = [...output.plainText, ...output.dimText].join("\n");
  assert.match(rendered, /session: session-intro/);
  assert.match(rendered, /cwd: C:\\workspace\\kitty/);
  assert.doesNotMatch(rendered, /Tools:/);
  assert.match(rendered, /\/multi\s+Enter multiline input/);
  assert.match(rendered, /quit\s+Exit/);
});

test("interactive intro can print a supplied active tool surface label", () => {
  const output = createRecordingOutput();

  writeCliInteractiveIntro({
    cwd: "C:\\workspace\\kitty",
    session: { id: "session-spec" },
    output,
    toolsLabel: "custom runtime surface",
  });

  const rendered = [...output.plainText, ...output.dimText].join("\n");
  assert.match(rendered, /Tools: custom runtime surface/);
});

function createRecordingOutput(): ShellOutputPort & {
  plainText: string[];
  dimText: string[];
} {
  const plainText: string[] = [];
  const dimText: string[] = [];
  return {
    plainText,
    dimText,
    plain: (text) => plainText.push(text),
    dim: (text) => dimText.push(text),
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    heading: () => undefined,
    interrupt: () => undefined,
  };
}
