import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/session.js";
import type { InteractiveExitGuard, InteractiveExitProcess } from "../src/interaction/exitGuard.js";
import { InteractiveSessionDriver } from "../src/interaction/sessionDriver.js";
import type { InteractionShell } from "../src/interaction/shell.js";
import { createReadlineInputPort } from "../src/shell/cli/readlineInput.js";
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

test("quit lists running background processes and lets the user cancel exit", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "quit" },
      { kind: "submit", value: "n" },
      { kind: "submit", value: "quit" },
      { kind: "submit", value: "y" },
    ],
  });
  const runningProcesses: InteractiveExitProcess[] = [
    {
      kind: "background_job",
      id: "bg-123",
      pid: 123,
      summary: "background bg-123 pid=123 npm run dev-server",
    },
    {
      kind: "teammate_worker",
      id: "worker-alpha",
      pid: 456,
      summary: "teammate alpha pid=456 role=implementer status=working",
    },
  ];
  const exitGuard = createExitGuard({
    processSets: [runningProcesses, runningProcesses],
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

  assert.equal(exitGuard.collectCalls, 2);
  assert.equal(exitGuard.terminateCalls, 1);
  assert.deepEqual(exitGuard.lastTerminated.map((item) => item.pid), [123, 456]);
  assert.equal(shell.outputs.some((entry) => entry.level === "warn" && entry.text.includes("Running background processes detected")), true);
  assert.equal(shell.outputs.some((entry) => entry.level === "plain" && entry.text.includes("background bg-123 pid=123")), true);
  assert.equal(shell.outputs.some((entry) => entry.level === "plain" && entry.text.includes("teammate alpha pid=456")), true);
  assert.equal(shell.outputs.some((entry) => entry.level === "info" && entry.text.includes("Exit cancelled")), true);
});

test("quit fails closed when some background processes cannot be terminated", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [
      { kind: "submit", value: "quit" },
      { kind: "submit", value: "y" },
      { kind: "submit", value: "quit" },
    ],
  });
  const runningProcesses: InteractiveExitProcess[] = [
    {
      kind: "background_job",
      id: "bg-999",
      pid: 999,
      summary: "background bg-999 pid=999 npm run watcher",
    },
  ];
  const exitGuard = createExitGuard({
    processSets: [runningProcesses, []],
    terminateResult: {
      terminatedPids: [],
      failedPids: [999],
    },
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

  assert.equal(exitGuard.collectCalls, 2);
  assert.equal(exitGuard.terminateCalls, 1);
  assert.equal(shell.outputs.some((entry) => entry.level === "error" && entry.text.includes("Could not stop all background processes")), true);
  assert.equal(shell.outputs.filter((entry) => entry.level === "info" && entry.text.includes("Session saved.")).length, 1);
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

test("readline input keeps a process-level SIGINT bridge while interactive listeners are bound", () => {
  const port = createReadlineInputPort();
  const beforeListeners = process.listeners("SIGINT");
  let interruptCount = 0;

  const release = port.bindInterrupt(() => {
    interruptCount += 1;
  });

  const afterListeners = process.listeners("SIGINT");
  const sigintBridge = afterListeners.find((listener) => !beforeListeners.includes(listener));

  assert.equal(typeof sigintBridge, "function");
  sigintBridge?.("SIGINT");
  assert.equal(interruptCount, 1);

  release();
  assert.equal(process.listeners("SIGINT").includes(sigintBridge as (...args: any[]) => void), false);
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
  assert.equal(shell.disposeCount, 1);
});

test("startInteractiveChat surfaces shell bootstrap failures directly", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  await assert.rejects(
    () =>
      startInteractiveChat(
        {
          cwd,
          config,
          session,
          sessionStore,
        },
        {
          createShell() {
            throw new Error("shell bootstrap failed");
          },
        },
      ),
    /shell bootstrap failed/,
  );
});
