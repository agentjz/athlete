import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../../src/agent/systemPrompt.js";
import { INTP_PROFILE } from "../../src/agent/profiles/intp/index.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("agent static prompt names the lead loop without hardcoding the tool surface", () => {
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
  assert.match(text, /active tool surface is supplied by the current runtime/);
  assert.match(text, /exposed tool definitions as the active capability boundary/);
  assert.match(text, /extra blocks define the active workflow/);
  assert.doesNotMatch(text, /read, edit, write, and bash/);
  assert.doesNotMatch(text, /active tool surface is read, edit, write, and bash/);
});

test("ordinary agent prompt stays outside spec mode until a spec runtime block is supplied", () => {
  const config = createTestRuntimeConfig(process.cwd());
  config.extensions.spec = true;
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

  assert.doesNotMatch(text, /Spec mode contract/);
  assert.doesNotMatch(text, /call spec_create first/);
});

test("spec runtime block leads the work loop when supplied", () => {
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
      mode: "spec",
      extraStaticBlocks: [
        "Spec mode contract\ncall spec_create first\nnotes.md",
      ],
    },
  );

  assert.ok(text.indexOf("Spec mode contract") < text.indexOf("Work Loop"));
  assert.match(text, /call spec_create first/);
  assert.match(text, /notes\.md/);
});

test("intp profile carries compressed communication policy", () => {
  const profileText = INTP_PROFILE.personaBlocks.map((block) => block.content).join("\n");

  assert.match(profileText, /short, exact, substance-first/);
  assert.match(profileText, /Keep detail only when it changes action or prevents ambiguity/);
});
