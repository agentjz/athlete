import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { buildToolExecutionFailureResult } from "../../src/agent/turn/toolExecutor.js";
import { resolveToollessTurn } from "../../src/agent/turn/toolless.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import type { SkillRuntimeState } from "../../src/skills/types.js";
import { finalizeToolExecution } from "../../src/tools/toolFinalize.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import type { ToolRegistryEntry } from "../../src/tools/types.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ProtocolRequestStore } from "../../src/team/requestStore.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";
















function createBlockedToolEntry(): Pick<ToolRegistryEntry, "name" | "governance"> {
  return {
    name: "blocked_without_exit",
    governance: {
      source: "host",
      specialty: "external",
      mutation: "read",
      risk: "low",
      destructive: false,
      concurrencySafe: true,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
  };
}

test("run_shell timeout returns structured timed_out runtime state", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-timeout", t);
  const registry = createToolRegistry();

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
  const registry = createToolRegistry();
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
  const registry = createToolRegistry();

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
  const registry = createToolRegistry();

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
