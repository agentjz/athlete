import assert from "node:assert/strict";
import test from "node:test";

import { buildStaticPromptBlocks } from "../../src/agent/prompt/static.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("agent static prompt names the lead loop and foundation tools", () => {
  const config = createTestRuntimeConfig(process.cwd());
  const blocks = buildStaticPromptBlocks({
    config,
    projectContext: {
      rootDir: process.cwd(),
      stateRootDir: process.cwd(),
      cwd: process.cwd(),
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
    },
    runtimeState: {
      identity: {
        kind: "lead",
        name: "lead",
      },
      taskSummary: "",
    },
  });

  const text = blocks.join("\n");
  assert.match(text, /lead agent/);
  assert.match(text, /read, edit, write, and bash/);
});
