import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import type { InteractiveExitGuard, InteractiveExitProcess } from "../../src/interaction/exitGuard.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import type { InteractionShell } from "../../src/interaction/shell.js";
import { createReadlineInputPort } from "../../src/shell/cli/readlineInput.js";
import { startInteractiveChat, type StartInteractiveChatDependencies } from "../../src/ui/interactive.js";
import { createAbortError } from "../../src/utils/abort.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "../helpers.js";

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
  promptLabels: string[];
  turnDisplayCount: number;
  disposeCount: number;
  triggerInterrupt(): void;
} {
  const prompts = [...(script.prompts ?? [])];
  const multiline = [...(script.multiline ?? [])];
  const outputs: Array<{ level: string; text: string }> = [];
  const turnEvents: Array<{ type: string; value: string }> = [];
  const promptLabels: string[] = [];
  let interruptHandler: (() => void) | null = null;
  let turnDisplayCount = 0;
  let disposeCount = 0;

  return {
    input: {
      async readInput(promptLabel) {
        promptLabels.push(String(promptLabel ?? ""));
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
          onToolResult(name) {
            turnEvents.push({ type: "tool_result", value: name });
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
    dispose() {
      disposeCount += 1;
    },
    outputs,
    turnEvents,
    promptLabels,
    get turnDisplayCount() {
      return turnDisplayCount;
    },
    get disposeCount() {
      return disposeCount;
    },
    triggerInterrupt() {
      interruptHandler?.();
    },
  };
}

function createExitGuard(script: {
  processSets?: InteractiveExitProcess[][];
  terminateResult?: { terminatedPids: number[]; failedPids: number[] };
} = {}): InteractiveExitGuard & {
  collectCalls: number;
  terminateCalls: number;
  lastTerminated: InteractiveExitProcess[];
} {
  const processSets = [...(script.processSets ?? [[]])];
  let collectCalls = 0;
  let terminateCalls = 0;
  let lastTerminated: InteractiveExitProcess[] = [];

  return {
    async collectRunningProcesses() {
      collectCalls += 1;
      return processSets.shift() ?? [];
    },
    async terminateProcesses(processes) {
      terminateCalls += 1;
      lastTerminated = [...processes];
      return script.terminateResult ?? {
        terminatedPids: processes.map((process) => process.pid),
        failedPids: [],
      };
    },
    get collectCalls() {
      return collectCalls;
    },
    get terminateCalls() {
      return terminateCalls;
    },
    get lastTerminated() {
      return lastTerminated;
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
  assert.equal(shell.outputs.some((entry) => entry.level === "plain" && entry.text.includes("> ship a summary")), true);
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

test("quit exits immediately when no background processes are running", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [{ kind: "submit", value: "quit" }],
  });
  const exitGuard = createExitGuard();

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    exitGuard,
  });

  await driver.run();

  assert.equal(exitGuard.collectCalls, 1);
  assert.equal(exitGuard.terminateCalls, 0);
  assert.equal(shell.outputs.some((entry) => entry.level === "info" && entry.text.includes("Session saved.")), true);
});

test("closed interactive input terminates running workers instead of leaving detached processes alive", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [{ kind: "closed" }],
  });
  const runningProcesses: InteractiveExitProcess[] = [
    {
      kind: "execution_worker",
      id: "exec-1",
      pid: 321,
      summary: "teammate execution exec-1 pid=321 actor=teammate-task-1 status=running",
    },
  ];
  const exitGuard = createExitGuard({
    processSets: [runningProcesses],
  });

  const driver = new InteractiveSessionDriver({
    cwd,
    config,
    session,
    sessionStore,
    shell,
    exitGuard,
  });

  await driver.run();

  assert.equal(exitGuard.collectCalls, 1);
  assert.equal(exitGuard.terminateCalls, 1);
  assert.deepEqual(exitGuard.lastTerminated.map((item) => item.pid), [321]);
  assert.equal(shell.outputs.some((entry) => entry.level === "warn" && entry.text.includes("Input closed")), true);
});
