import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/sessionStore.js";
import { InteractiveSessionDriver } from "../src/interaction/sessionDriver.js";
import type { InteractionShell } from "../src/interaction/shell.js";
import { startInteractiveChat, type StartInteractiveChatDependencies } from "../src/ui/interactive.js";
import { createAbortError } from "../src/utils/abort.js";
import { createTestRuntimeConfig } from "./helpers.js";

type PromptResult = { kind: "submit"; value: string } | { kind: "closed" };
type MultilineResult =
  | { kind: "submit"; value: string }
  | { kind: "cancel" }
  | { kind: "closed" };

function createFakeShell(script: {
  prompts?: PromptResult[];
  multiline?: MultilineResult[];
} = {}): InteractionShell & {
  outputs: Array<{ level: string; text: string }>;
  turnEvents: Array<{ type: string; value: string }>;
  turnDisplayCount: number;
  triggerInterrupt(): void;
} {
  const prompts = [...(script.prompts ?? [])];
  const multiline = [...(script.multiline ?? [])];
  const outputs: Array<{ level: string; text: string }> = [];
  const turnEvents: Array<{ type: string; value: string }> = [];
  let interruptHandler: (() => void) | null = null;
  let turnDisplayCount = 0;

  return {
    input: {
      async readInput() {
        return prompts.shift() ?? { kind: "closed" };
      },
      async readMultiline() {
        return multiline.shift() ?? { kind: "closed" };
      },
      bindInterrupt(handler) {
        interruptHandler = handler;
        return () => {
          if (interruptHandler === handler) {
            interruptHandler = null;
          }
        };
      },
    },
    output: {
      plain(text) {
        outputs.push({ level: "plain", text });
      },
      info(text) {
        outputs.push({ level: "info", text });
      },
      warn(text) {
        outputs.push({ level: "warn", text });
      },
      error(text) {
        outputs.push({ level: "error", text });
      },
      dim(text) {
        outputs.push({ level: "dim", text });
      },
      heading(text) {
        outputs.push({ level: "heading", text });
      },
      tool(text) {
        outputs.push({ level: "tool", text });
      },
      interrupt(text) {
        outputs.push({ level: "interrupt", text });
      },
    },
    createTurnDisplay() {
      turnDisplayCount += 1;
      return {
        callbacks: {
          onStatus(text) {
            turnEvents.push({ type: "status", value: text });
          },
          onAssistantDelta(text) {
            turnEvents.push({ type: "assistant_delta", value: text });
          },
          onAssistantText(text) {
            turnEvents.push({ type: "assistant_text", value: text });
          },
          onAssistantDone(text) {
            turnEvents.push({ type: "assistant_done", value: text });
          },
          onToolCall(name) {
            turnEvents.push({ type: "tool_call", value: name });
          },
        },
        flush() {
          turnEvents.push({ type: "flush", value: "" });
        },
        dispose() {
          turnEvents.push({ type: "dispose", value: "" });
        },
      };
    },
    outputs,
    turnEvents,
    get turnDisplayCount() {
      return turnDisplayCount;
    },
    triggerInterrupt() {
      interruptHandler?.();
    },
  };
}

test("shared interaction driver can run a full turn through a shell adapter without CLI stdio", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "ship a summary" },
      { kind: "submit", value: "quit" },
    ],
  });
  const seenInputs: string[] = [];

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    runTurn: async (options) => {
      seenInputs.push(options.input);
      options.callbacks?.onStatus?.("routing turn");
      options.callbacks?.onAssistantText?.("done");
      options.callbacks?.onAssistantDone?.("done");
      return {
        session: {
          ...options.session,
          title: "completed",
        },
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const finalSession = await driver.run();

  assert.deepEqual(seenInputs, ["ship a summary"]);
  assert.equal(finalSession.title, "completed");
  assert.equal(shell.turnDisplayCount, 1);
  assert.equal(shell.turnEvents.some((event) => event.type === "assistant_text" && event.value === "done"), true);
});

test("local commands still run through the shared shell boundary without invoking the agent turn", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "/session" },
      { kind: "submit", value: "quit" },
    ],
  });
  let runTurnCount = 0;

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    runTurn: async (options) => {
      runTurnCount += 1;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await driver.run();

  assert.equal(runTurnCount, 0);
  assert.equal(shell.outputs.some((entry) => entry.level === "info" && entry.text.includes(session.id)), true);
});

test("multiline input is routed through the shell adapter and submitted as one turn", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "/multi" },
      { kind: "submit", value: "quit" },
    ],
    multiline: [{ kind: "submit", value: "line 1\nline 2" }],
  });
  const seenInputs: string[] = [];

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    runTurn: async (options) => {
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await driver.run();

  assert.deepEqual(seenInputs, ["line 1\nline 2"]);
  assert.equal(shell.outputs.some((entry) => entry.text.includes("multiline mode")), true);
});

test("interrupts abort the in-flight turn through the shared shell boundary", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "run a long turn" },
      { kind: "submit", value: "quit" },
    ],
  });

  let startedResolve: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  let aborted = false;

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    runTurn: async (options) => {
      startedResolve?.();
      return new Promise((resolve, reject) => {
        options.abortSignal?.addEventListener("abort", () => {
          aborted = true;
          reject(createAbortError("Turn aborted"));
        });
      });
    },
  });

  const runPromise = driver.run();
  await started;
  shell.triggerInterrupt();
  await runPromise;

  assert.equal(aborted, true);
  assert.equal(
    shell.outputs.some((entry) => entry.level === "interrupt" && entry.text.includes("Interrupted the current turn")),
    true,
  );
});

test("startInteractiveChat delegates session control to the shared driver", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell();
  const seenDriverOptions: Array<Record<string, unknown>> = [];
  let runCount = 0;
  let introCount = 0;

  const dependencies: StartInteractiveChatDependencies = {
    shell,
    createDriver(options) {
      seenDriverOptions.push(options as unknown as Record<string, unknown>);
      return {
        async run() {
          runCount += 1;
          return session;
        },
      };
    },
    writeIntro() {
      introCount += 1;
    },
  };

  await startInteractiveChat(
    {
      cwd,
      config,
      session,
      sessionStore,
    },
    dependencies,
  );

  assert.equal(introCount, 1);
  assert.equal(runCount, 1);
  assert.equal(seenDriverOptions.length, 1);
  assert.equal(seenDriverOptions[0]?.shell, shell);
  assert.equal((seenDriverOptions[0]?.session as { id?: string }).id, session.id);
});
