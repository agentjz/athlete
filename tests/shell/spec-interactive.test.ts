import assert from "node:assert/strict";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { startSpecInteractiveChat } from "../../src/shell/cli/specInteractive.js";
import { SessionStore } from "../../src/session/store.js";
import type { InteractionShell } from "../../src/interaction/shell.js";
import { createSpecBuiltinToolFilter } from "../../src/spec/runtime.js";
import { createSpecTools } from "../../src/extensions/tools/spec/index.js";
import { getBuiltinTools } from "../../src/tools/toolCatalog.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "../helpers.js";

test("spec interactive intro reflects the initial spec-stage tool surface", async (t) => {
  const root = await createTempWorkspace("spec-interactive-intro", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(getAppPaths(root).sessionsDir);
  const session = await sessionStore.create(root);
  const shell = createClosedRecordingShell();

  await startSpecInteractiveChat({
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    shell,
  });

  const rendered = [...shell.plainText, ...shell.dimText, ...shell.infoText].join("\n");
  const expectedToolsLabel = formatExpectedSpecToolsLabel();
  assert.match(rendered, new RegExp(`Tools: ${escapeRegExp(expectedToolsLabel)}`));
  assert.match(rendered, /Spec mode: requirements -> design -> tasks -> implement -> validate/);
});

function formatExpectedSpecToolsLabel(): string {
  const builtinNames = getBuiltinTools()
    .filter(createSpecBuiltinToolFilter(null))
    .map((tool) => tool.definition.function.name);
  return `${builtinNames.join(", ")} + ${createSpecTools().length > 0 ? "spec" : ""}`.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createClosedRecordingShell(): InteractionShell & {
  plainText: string[];
  dimText: string[];
  infoText: string[];
} {
  const plainText: string[] = [];
  const dimText: string[] = [];
  const infoText: string[] = [];
  return {
    plainText,
    dimText,
    infoText,
    input: {
      readInput: async () => ({ kind: "closed" }),
      readMultiline: async () => ({ kind: "closed" }),
      bindInterrupt: () => () => undefined,
    },
    output: {
      plain: (text) => plainText.push(text),
      dim: (text) => dimText.push(text),
      info: (text) => infoText.push(text),
      warn: () => undefined,
      error: () => undefined,
      heading: () => undefined,
      interrupt: () => undefined,
    },
    createTurnDisplay: () => ({
      callbacks: {},
      flush: () => undefined,
      dispose: () => undefined,
    }),
  };
}
