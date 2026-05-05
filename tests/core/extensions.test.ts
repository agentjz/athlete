import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createHostSession } from "../../src/host/session.js";
import { runHostTurn } from "../../src/host/turn.js";
import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { buildExtensionRegistry, buildExtensionRuntimeState } from "../../src/extensions/index.js";
import { buildCliProgram } from "../../src/cli/program.js";
import { SessionStore } from "../../src/session/index.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("agent mode has no extension registry entries", () => {
  const registry = buildExtensionRegistry("agent");
  assert.deepEqual(registry.entries, []);
});

test("super mode exposes the Socratic workflow through the extension registry", () => {
  const registry = buildExtensionRegistry("super");
  assert.deepEqual(registry.entries.map((entry) => entry.id), ["socratic"]);
  assert.equal(registry.entries[0]?.source.kind, "workflow");
  assert.equal(registry.entries[0]?.workspaceRoot, "socratic");
});

test("agent prompt stays clean and super prompt includes Socratic workflow facts", async (t) => {
  const root = await createTempWorkspace("extensions-prompt", t);
  const config = createTestRuntimeConfig(root);
  const projectContext = {
    rootDir: root,
    stateRootDir: root,
    cwd: root,
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    ignoreRules: [],
  };

  const agentPrompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
    runtimeState: {},
  }).runtimeFactBlocks.join("\n");

  assert.doesNotMatch(agentPrompt, /Socratic/i);
  assert.doesNotMatch(agentPrompt, /Extension ecology/i);

  const extensions = await buildExtensionRuntimeState({
    cwd: root,
    config,
    mode: "super",
    sessionId: "study-session",
  });
  const superPrompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
    runtimeState: { extensions },
  }).runtimeFactBlocks.join("\n");

  assert.match(superPrompt, /Extension ecology/);
  assert.match(superPrompt, /Socratic workflow/);
  assert.match(superPrompt, /\.kitty[\\/]socratic[\\/]study-session[\\/]material/);
});

test("Socratic workspace is created inside .kitty per session", async (t) => {
  const root = await createTempWorkspace("socratic-workspace", t);
  await buildExtensionRuntimeState({
    cwd: root,
    config: createTestRuntimeConfig(root),
    mode: "super",
    sessionId: "session-a",
  });
  await buildExtensionRuntimeState({
    cwd: root,
    config: createTestRuntimeConfig(root),
    mode: "super",
    sessionId: "session-b",
  });

  for (const relativePath of [
    ".kitty/socratic/session-a/manifest.md",
    ".kitty/socratic/session-a/material",
    ".kitty/socratic/session-a/goals",
    ".kitty/socratic/session-a/questions",
    ".kitty/socratic/session-a/frictions",
    ".kitty/socratic/session-a/preferences",
    ".kitty/socratic/session-a/notes",
    ".kitty/socratic/session-a/index",
    ".kitty/socratic/session-a/sessions",
    ".kitty/socratic/session-b/manifest.md",
    ".kitty/socratic/session-b/material",
  ]) {
    const stat = await fs.stat(path.join(root, relativePath));
    assert.equal(relativePath.endsWith(".md") ? stat.isFile() : stat.isDirectory(), true, relativePath);
  }
});

test("cli exposes agent and super as separate user-facing modes", () => {
  const program = buildCliProgram({
    resolveRuntime: async () => {
      throw new Error("not used");
    },
  });
  const commands = program.commands.map((command) => command.name());
  assert.equal(commands.includes("agent"), true);
  assert.equal(commands.includes("super"), true);
});

test("web and telegram expose explicit super mode switches", () => {
  const program = buildCliProgram({
    resolveRuntime: async () => {
      throw new Error("not used");
    },
  });
  const webCommand = program.commands.find((command) => command.name() === "web");
  const telegramServeCommand = program.commands
    .find((command) => command.name() === "telegram")
    ?.commands.find((command) => command.name() === "serve");

  assert.equal(webCommand?.options.some((option) => option.long === "--super"), true);
  assert.equal(telegramServeCommand?.options.some((option) => option.long === "--super"), true);
});

test("super one-shot passes Socratic runtime facts without changing agent mode", async (t) => {
  const root = await createTempWorkspace("super-cli", t);
  const config = createTestRuntimeConfig(root);

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: { cwd: root },
    }),
    runOneShot: async (options) => {
      assert.equal(options.prompt, "开始学习");
      assert.equal(options.mode, "super");
      return {
        session: options.session,
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
        },
      };
    },
  });

  await program.parseAsync(["node", "kitty", "super", "开始学习"]);
});

test("host builds Socratic runtime facts for every super turn", async (t) => {
  const root = await createTempWorkspace("host-super", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createHostSession(sessionStore, root);

  await runHostTurn({
    host: "test",
    input: "开始学习",
    cwd: root,
    config,
    session,
    sessionStore,
    mode: "super",
  }, {
    runTurn: async (options) => {
      assert.equal(options.runtimePromptState?.extensions?.mode, "super");
      assert.deepEqual(
        options.runtimePromptState?.extensions?.enabledManifests.map((manifest) => manifest.id),
        ["socratic"],
      );
      assert.match(options.runtimePromptState?.extensions?.promptBlocks.join("\n") ?? "", /\.kitty[\\/]socratic/);
      return {
        session: options.session,
        changedPaths: [],
      };
    },
    createToolRegistry: async () => ({
      definitions: [],
      execute: async () => ({ ok: false, output: "not used" }),
    }),
  });
});

test("super resume is declared with an explicit session id", () => {
  const program = buildCliProgram({
    resolveRuntime: async () => {
      throw new Error("not used");
    },
  });
  const superCommand = program.commands.find((command) => command.name() === "super");
  const resumeOption = superCommand?.options.find((option) => option.long === "--resume");

  assert.equal(resumeOption?.flags, "-r, --resume <sessionId>");
});

test("agent one-shot does not pass extension runtime facts", async (t) => {
  const root = await createTempWorkspace("agent-cli", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createHostSession(sessionStore, root);

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: { cwd: root },
    }),
    runOneShot: async (options) => {
      assert.equal(options.prompt, "修代码");
      assert.equal(options.mode, "agent");
      return {
        session,
        closeout: {
          sessionId: session.id,
          completed: true,
          terminalTransition: null,
        },
      };
    },
  });

  await program.parseAsync(["node", "kitty", "agent", "修代码"]);
});
