import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../../src/agent/systemPrompt.js";
import { INTP_PROFILE } from "../../src/agent/profiles/intp/index.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("agent static prompt names the lead loop and foundation tools", () => {
  const config = createTestRuntimeConfig(process.cwd());
  const text = buildSystemPrompt(
    process.cwd(),
    config,
    {
      rootDir: process.cwd(),
      stateRootDir: process.cwd(),
      cwd: process.cwd(),
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
    },
    undefined,
    {
      identity: {
        kind: "lead",
        name: "lead",
      },
      taskSummary: "",
    },
  );

  assert.match(text, /lead agent/);
  assert.match(text, /read, edit, write, and bash/);
});

test("intp profile carries compressed communication policy", () => {
  const profileText = INTP_PROFILE.personaBlocks.map((block) => block.content).join("\n");

  assert.match(profileText, /short, exact, no fluff/);
  assert.match(profileText, /Keep detail only when it changes action or prevents ambiguity/);
});
