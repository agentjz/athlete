import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { closeExecution } from "../../src/execution/closeout.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { runExecutionWorker } from "../../src/execution/worker.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import { readCrashReports, readObservabilityEvents } from "../observability.helpers.js";

test("execution observability records worker start and closeout lifecycle events", async (t) => {
  const root = await createTempWorkspace("execution-observability-worker", t);
  const config = createTestRuntimeConfig(root);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background-check",
    cwd: root,
    worktreePolicy: "none",
    command: `${process.execPath} -e "process.stdout.write('ok')"`,
  });

  await runExecutionWorker({
    rootDir: root,
    config,
    executionId: execution.id,
  });

  const events = await readObservabilityEvents(root);
  const executionEvents = events.filter((event) => event.event === "execution.lifecycle");

  assert.deepEqual(
    executionEvents.map((event) => event.status),
    ["started", "completed"],
  );
  assert.equal(executionEvents[0]?.executionId, execution.id);
  assert.equal((executionEvents[0]?.details as Record<string, unknown>)?.lane, "command");
  assert.equal((executionEvents[0]?.details as Record<string, unknown>)?.actorName, "background-check");
  assert.equal(typeof executionEvents[1]?.durationMs, "number");
});

test("execution closeout observability records aborted status details without inventing execution truth", async (t) => {
  const root = await createTempWorkspace("execution-observability-closeout", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alice",
    actorRole: "implementer",
    cwd: root,
    worktreePolicy: "task",
    prompt: "finish task",
  });
  await store.start(execution.id, {
    pid: process.pid,
    sessionId: "session-closeout",
    cwd: root,
  });

  await closeExecution({
    rootDir: root,
    executionId: execution.id,
    status: "aborted",
    summary: "execution aborted by operator",
    statusDetail: "user_abort",
    notifyRequester: false,
  });

  const events = await readObservabilityEvents(root);
  const executionEvents = events.filter((event) => event.event === "execution.lifecycle");

  assert.deepEqual(
    executionEvents.map((event) => event.status),
    ["aborted"],
  );
  assert.equal((executionEvents[0]?.details as Record<string, unknown>)?.statusDetail, "user_abort");
});

test("crash recorder writes crash files for uncaught exceptions and unhandled rejections without swallowing the crash", async (t) => {
  const root = await createTempWorkspace("execution-observability-crash", t);
  const crashRecorderModule = pathToFileURL(
    path.join(process.cwd(), ".test-build", "src", "observability", "crashRecorder.js"),
  ).href;

  const exception = await runCrashChild(crashRecorderModule, root, "exception");
  assert.notEqual(exception.exitCode, 0);

  const rejection = await runCrashChild(crashRecorderModule, root, "rejection");
  assert.notEqual(rejection.exitCode, 0);

  const reports = await readCrashReports(root);

  assert.equal(reports.length, 2);
  assert.equal(reports.every((report) => report.host === "cli"), true);
  assert.equal(reports.every((report) => report.sessionId === "session-crash"), true);
  assert.equal(reports.every((report) => report.executionId === "execution-crash"), true);
  assert.equal(reports.every((report) => String(report.cwd ?? "") === root), true);
  assert.equal(reports.every((report) => Array.isArray(report.argv)), true);
  assert.equal(reports.some((report) => /exception crash/i.test(String(report.errorMessage ?? ""))), true);
  assert.equal(reports.some((report) => /rejection crash/i.test(String(report.errorMessage ?? ""))), true);
  assert.equal(reports.every((report) => /Error:/i.test(String(report.stack ?? ""))), true);
});

async function runCrashChild(
  crashRecorderModuleHref: string,
  rootDir: string,
  mode: "exception" | "rejection",
): Promise<{ exitCode: number | null; stderr: string }> {
  const code = [
    `import { installCrashRecorder } from ${JSON.stringify(crashRecorderModuleHref)};`,
    `installCrashRecorder({ rootDir: ${JSON.stringify(rootDir)}, host: "cli", sessionId: "session-crash", executionId: "execution-crash" });`,
    mode === "exception"
      ? `throw new Error("exception crash");`
      : `Promise.reject(new Error("rejection crash")); setTimeout(() => {}, 50);`,
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: rootDir,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr: Buffer[] = [];

    child.stderr.on("data", (chunk) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      resolve({
        exitCode,
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
