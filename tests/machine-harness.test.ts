import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/session.js";
import { handleCompletedAssistantResponse } from "../src/agent/turn.js";
import type { RunTurnOptions } from "../src/agent/types.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { BackgroundJobStore } from "../src/execution/background.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

test("read_file emits a stable identity, edit_file uses it, and stale identities are rejected", async (t) => {
  const root = await createTempWorkspace("machine-identity", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "alpha\nbeta\ngamma\n", "utf8");

  const registry = createToolRegistry("agent");
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  const identity = readPayload.identity as Record<string, unknown>;
  const anchors = readPayload.anchors as Array<Record<string, unknown>>;
  const betaAnchor = anchors.find((anchor) => anchor.line === 2);

  assert.equal(typeof identity.sha256, "string");
  assert.equal(identity.path, filePath);
  assert.ok(betaAnchor);
  assert.deepEqual(readResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(readResult.metadata?.protocol?.policy, "parallel");

  await fs.writeFile(filePath, "header\nalpha\nbeta\ngamma\n", "utf8");
  await assert.rejects(
    () =>
      registry.execute(
        "edit_file",
        JSON.stringify({
          path: "story.txt",
          expected_identity: identity,
          edits: [
            {
              anchor: betaAnchor,
              old_string: "beta",
              new_string: "BETA",
            },
          ],
        }),
        makeToolContext(root, root) as never,
      ),
    /stale/i,
  );

  const refreshedRead = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const refreshedIdentity = (JSON.parse(refreshedRead.output) as Record<string, unknown>).identity;
  const refreshedAnchors = (JSON.parse(refreshedRead.output) as Record<string, unknown>).anchors as Array<Record<string, unknown>>;
  const refreshedBetaAnchor = refreshedAnchors.find((anchor) => anchor.line === 3);
  const editResult = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: refreshedIdentity,
      edits: [
        {
          anchor: refreshedBetaAnchor,
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(editResult.ok, true);
  assert.ok(refreshedBetaAnchor);
  assert.deepEqual(editResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(editResult.metadata?.protocol?.policy, "sequential");
  assert.match(await fs.readFile(filePath, "utf8"), /BETA/);
});

test("write_file blocks overwriting existing files during prepare and points the model back to edit_file", async (t) => {
  const root = await createTempWorkspace("machine-write-guard", t);
  await fs.writeFile(path.join(root, "existing.txt"), "old\n", "utf8");

  const registry = createToolRegistry("agent");
  const result = await registry.execute(
    "write_file",
    JSON.stringify({
      path: "existing.txt",
      content: "new\n",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "WRITE_EXISTING_FILE_BLOCKED");
  assert.match(String(payload.hint ?? ""), /edit_file/i);
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.deepEqual(result.metadata?.protocol?.phases, ["prepare", "finalize"]);
  assert.equal(result.metadata?.protocol?.blockedIn, "prepare");
  assert.equal(result.metadata?.protocol?.guardCode, "WRITE_EXISTING_FILE_BLOCKED");
});

test("run_shell blocks direct shell file reads and routes them back to read_file", async (t) => {
  const root = await createTempWorkspace("machine-shell-guard", t);
  await fs.writeFile(path.join(root, "notes.txt"), "alpha\n", "utf8");

  const registry = createToolRegistry("agent");
  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "Get-Content notes.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "SHELL_FILE_READ_BLOCKED");
  assert.match(String(payload.hint ?? ""), /read_file/i);
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.deepEqual(result.metadata?.protocol?.phases, ["prepare", "finalize"]);
  assert.equal(result.metadata?.protocol?.blockedIn, "prepare");
});

test("run_shell runtime truncates long output into preview and persists full output as an artifact", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-output", t);
  const registry = createToolRegistry("agent");

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "node -e \"process.stdout.write('S'.repeat(14000))\"",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const outputPath = String(payload.outputPath ?? "");
  const outputPathAbsolute = path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);
  const persistedOutput = await fs.readFile(outputPathAbsolute, "utf8");

  assert.equal(result.ok, true);
  assert.equal(payload.status, "completed");
  assert.equal(payload.truncated, true);
  assert.equal(outputPath.length > 0, true);
  assert.equal(persistedOutput.length >= 14_000, true);
  assert.equal(String(payload.output ?? "").length < persistedOutput.length, true);
  assert.equal(result.metadata?.runtime?.truncated, true);
  assert.equal(result.metadata?.runtime?.outputPath, outputPath);
  assert.equal(result.metadata?.runtime?.status, "completed");
});

test("run_shell timeout returns structured timed_out runtime state", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-timeout", t);
  const registry = createToolRegistry("agent");

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "node -e \"setTimeout(() => {}, 4000)\"",
      timeout_ms: 150,
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.status, "timed_out");
  assert.equal(payload.timedOut, true);
  assert.equal(payload.stalled, false);
  assert.equal(result.metadata?.runtime?.status, "timed_out");
  assert.equal(result.metadata?.runtime?.timedOut, true);
});

test("run_shell abort returns structured aborted runtime state without throwing retry sleep errors", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-abort", t);
  const registry = createToolRegistry("agent");
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(new Error("abort test")), 150);

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "node -e \"setTimeout(() => {}, 4000)\"",
      timeout_ms: 5_000,
    }),
    makeToolContext(root, root, { abortSignal: abortController.signal }) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.status, "aborted");
  assert.equal(payload.aborted, true);
  assert.equal(payload.timedOut, false);
  assert.equal(result.metadata?.runtime?.status, "aborted");
  assert.equal(result.metadata?.runtime?.aborted, true);
});

test("run_shell fails closed when interactive process fields are sent to a non-interactive contract", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-noninteractive", t);
  const registry = createToolRegistry("agent");

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "echo hello",
      stdin: "hello from stdin",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "INVALID_TOOL_ARGUMENTS");
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.equal(result.metadata?.protocol?.blockedIn, "prepare");
  assert.deepEqual(result.metadata?.protocol?.phases, ["prepare", "finalize"]);
});

test("background_run, background_check, and background_terminate expose one process protocol contract", async (t) => {
  const root = await createTempWorkspace("machine-background-process-contract", t);
  const registry = createToolRegistry("agent");

  const started = await registry.execute(
    "background_run",
    JSON.stringify({
      command: "node -e \"setTimeout(() => {}, 5000)\"",
    }),
    makeToolContext(root, root) as never,
  );
  const startedPayload = JSON.parse(started.output) as Record<string, unknown>;
  const executionId = String(startedPayload.execution_id ?? "");
  const startedProcess = startedPayload.process as Record<string, unknown>;

  assert.equal(started.ok, true);
  assert.equal(executionId.length > 0, true);
  assert.equal(startedProcess.protocol, "deadmouse.exec.v1");
  assert.equal(startedProcess.state, "running");
  assert.equal((startedProcess.capabilities as Record<string, unknown>).terminate, true);

  const checkedRunning = await registry.execute(
    "background_check",
    JSON.stringify({
      job_id: executionId,
    }),
    makeToolContext(root, root) as never,
  );
  const checkedRunningPayload = JSON.parse(checkedRunning.output) as Record<string, unknown>;
  const runningProcess = checkedRunningPayload.process as Record<string, unknown>;
  assert.equal(runningProcess.protocol, "deadmouse.exec.v1");
  assert.equal(runningProcess.state, "running");
  assert.equal((runningProcess.events as string[]).includes("process/read"), true);

  const terminated = await registry.execute(
    "background_terminate",
    JSON.stringify({
      job_id: executionId,
    }),
    makeToolContext(root, root) as never,
  );
  const terminatedPayload = JSON.parse(terminated.output) as Record<string, unknown>;
  const terminatedProcess = terminatedPayload.process as Record<string, unknown>;

  assert.equal(terminated.ok, true);
  assert.equal((terminatedPayload.job as Record<string, unknown>).status, "aborted");
  assert.equal(terminatedProcess.state, "closed");
  assert.equal((terminatedProcess.events as string[]).includes("process/terminate"), true);
  assert.equal((terminatedProcess.events as string[]).includes("process/exited"), true);
  assert.equal((terminatedProcess.events as string[]).includes("process/closed"), true);

  const checkedClosed = await registry.execute(
    "background_check",
    JSON.stringify({
      job_id: executionId,
    }),
    makeToolContext(root, root) as never,
  );
  const checkedClosedPayload = JSON.parse(checkedClosed.output) as Record<string, unknown>;
  const closedProcess = checkedClosedPayload.process as Record<string, unknown>;
  assert.equal((checkedClosedPayload.job as Record<string, unknown>).status, "aborted");
  assert.equal(closedProcess.state, "closed");
  assert.equal((closedProcess.events as string[]).includes("process/closed"), true);
});

test("background_terminate is idempotent for already-terminal background jobs", async (t) => {
  const root = await createTempWorkspace("machine-background-terminate-idempotent", t);
  const registry = createToolRegistry("agent");
  const store = new BackgroundJobStore(root);

  const statuses: Array<"completed" | "failed" | "timed_out" | "aborted"> = [
    "completed",
    "failed",
    "timed_out",
    "aborted",
  ];

  for (const status of statuses) {
    const created = await store.create({
      command: `echo ${status}`,
      cwd: root,
      requestedBy: "lead",
      timeoutMs: 120_000,
      stallTimeoutMs: 30_000,
    });
    await store.setPid(created.id, process.pid);
    const terminal = await store.complete(created.id, {
      status,
      exitCode: status === "completed" ? 0 : 1,
      output: `${status}-done`,
    });

    const beforeFinishedAt = terminal.finishedAt;
    const terminated = await registry.execute(
      "background_terminate",
      JSON.stringify({
        job_id: terminal.id,
      }),
      makeToolContext(root, root) as never,
    );
    const payload = JSON.parse(terminated.output) as Record<string, unknown>;
    const terminatedJob = payload.job as Record<string, unknown>;
    const processPayload = payload.process as Record<string, unknown>;

    assert.equal(terminated.ok, true);
    assert.equal(payload.already_terminal, true);
    assert.equal(payload.idempotent, true);
    assert.equal(terminatedJob.status, status);
    assert.equal(processPayload.state, "closed");
    assert.equal((processPayload.capabilities as Record<string, unknown>).terminate, false);

    const reloaded = await store.load(terminal.id);
    assert.equal(reloaded.status, status);
    assert.equal(reloaded.finishedAt, beforeFinishedAt);
  }
});

test("handleCompletedAssistantResponse refuses to finalize an empty visible result", async () => {
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());

  const outcome = await handleCompletedAssistantResponse({
    session,
    response: {
      content: "   ",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set<string>(),
    hadIncompleteTodosAtStart: false,
    hasSubstantiveToolActivity: false,
    verificationState: session.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the task",
      cwd: process.cwd(),
      config: createTestRuntimeConfig(process.cwd()),
      session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "continue");
  if (outcome.kind === "continue") {
    assert.equal(outcome.transition.reason.code, "continue.empty_assistant_response");
    assert.equal((outcome.session as any).checkpoint?.flow?.lastTransition?.reason?.code, "continue.empty_assistant_response");
  }
});
