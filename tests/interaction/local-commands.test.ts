import assert from "node:assert/strict";
import test from "node:test";

import { handleLocalCommand, isExplicitExitCommand } from "../../src/interaction/localCommands.js";
import type { ShellOutputPort } from "../../src/interaction/shell.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("local commands classify empty, exit, help, session, config, and multiline input", async (t) => {
  const root = await createTempWorkspace("local-commands", t);
  const output = createRecordingOutput();
  const context = {
    cwd: root,
    session: {
      id: "session-local-command",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      cwd: root,
      messageCount: 0,
      messages: [],
    },
    config: createTestRuntimeConfig(root),
  };

  assert.equal(isExplicitExitCommand(" /QUIT "), true);
  assert.equal(await handleLocalCommand("   ", context, output), "handled");
  assert.equal(await handleLocalCommand("/exit", context, output), "quit");
  assert.equal(await handleLocalCommand("/multi", context, output), "multiline");
  assert.equal(await handleLocalCommand("/help", context, output), "handled");
  assert.equal(await handleLocalCommand("/session", context, output), "handled");
  assert.equal(await handleLocalCommand("/config", context, output), "handled");
  assert.equal(await handleLocalCommand("explain this repo", context, output), "continue");

  assert.match(output.plainText.join("\n"), /Any other input is sent directly to kitty/);
  assert.deepEqual(output.infoText, [
    "Current session: session-local-command",
    "model=gpt-5.5 baseUrl=https://api.openai.com/v1",
  ]);
});

function createRecordingOutput(): ShellOutputPort & {
  plainText: string[];
  infoText: string[];
} {
  const plainText: string[] = [];
  const infoText: string[] = [];
  return {
    plainText,
    infoText,
    plain: (text) => plainText.push(text),
    info: (text) => infoText.push(text),
    warn: () => undefined,
    error: () => undefined,
    dim: () => undefined,
    heading: () => undefined,
    interrupt: () => undefined,
  };
}
