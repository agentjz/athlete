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
  assert.notEqual(seenDriverOptions[0]?.shell, shell);
  assert.equal((seenDriverOptions[0]?.session as { id?: string }).id, session.id);
  assert.equal(shell.disposeCount, 1);
});

test("startInteractiveChat mirrors terminal input and output into observability logs", async (t) => {
  const cwd = await createTempWorkspace("terminal-log", t);
  await initGitRepo(cwd);
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(cwd);
  const shell = createFakeShell({
    prompts: [{ kind: "submit", value: "hello terminal" }],
  });

  await startInteractiveChat(
    {
      cwd,
      config,
      session,
      sessionStore,
    },
    {
      shell,
      writeIntro({ shell: introShell }) {
        introShell.output.info("intro output");
      },
      createDriver(options) {
        return {
          async run() {
            const prompt = await options.shell.input.readInput("> ");
            if (prompt.kind === "submit") {
              const display = options.shell.createTurnDisplay({
                cwd,
                config,
                abortSignal: new AbortController().signal,
              });
              display.callbacks.onAssistantText?.("assistant says hello\n");
              display.callbacks.onToolCall?.("read_file", "{\"path\":\"secret.txt\",\"content\":\"large noise\"}");
              display.callbacks.onToolResult?.("read_file", "very large tool result body that should not be mirrored");
              options.shell.output.plain(`echo ${prompt.value}`);
            }
            return session;
          },
        };
      },
    },
  );

  const logDir = path.join(
    cwd,
    ".deadmouse",
    "observability",
    "terminal",
    new Date().toISOString().slice(0, 10).replaceAll("-", ""),
  );
  const logFiles = await fs.readdir(logDir);
  assert.equal(logFiles.length, 1);
  assert.equal(logFiles[0], `${session.id}.log`);
  const logPath = path.join(logDir, logFiles[0]!);
  const log = await fs.readFile(logPath, "utf8");
  assert.match(log, /intro output/);
  assert.match(log, /> hello terminal/);
  assert.match(log, /assistant says hello/);
  assert.match(log, /\[tool:call\] read_file \(.* bytes\)/);
  assert.match(log, /\[tool:result\] read_file \(.* bytes\)/);
  assert.doesNotMatch(log, /secret\.txt/);
  assert.doesNotMatch(log, /very large tool result body/);
  assert.match(log, /echo hello terminal/);
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
