import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { buildCliProgram } from "../../src/cli.js";
import { createPersistedSession } from "../../src/host/session.js";
import { runHostTurn } from "../../src/host/turn.js";
import { appendObservabilityEvent } from "../../src/observability/writer.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import {
  captureStdout,
  getLatestObservabilityEventFile,
  parseCommander,
  readObservabilityEvents,
} from "../observability.helpers.js";

test("observability events write JSONL under project state and do not mutate session truth files", async (t) => {
  const root = await createTempWorkspace("operator-observability-write", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createPersistedSession(sessionStore, root);
  const sessionFile = path.join(config.paths.sessionsDir, `${session.id}.json`);
  const before = await fs.readFile(sessionFile, "utf8");

  await appendObservabilityEvent(root, {
    event: "tool.execution",
    status: "completed",
    sessionId: session.id,
    toolName: "write_file",
    durationMs: 24,
    identityKind: "lead",
    identityName: "lead",
    details: {
      changedPathCount: 1,
      verificationAttempted: true,
      verificationPassed: true,
    },
  });

  const paths = getProjectStatePaths(root);
  const latestEventFile = await getLatestObservabilityEventFile(root);
  const events = await readObservabilityEvents(root);
  const after = await fs.readFile(sessionFile, "utf8");

  assert.equal(String(latestEventFile ?? "").startsWith(paths.observabilityEventsDir), true);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.version, 1);
  assert.equal(events[0]?.event, "tool.execution");
  assert.equal(events[0]?.status, "completed");
  assert.equal(events[0]?.sessionId, session.id);
  assert.equal(events[0]?.toolName, "write_file");
  assert.equal(before, after);
  assert.equal(before.includes("\"observability\""), false);
  assert.equal(before.includes("\"tool.execution\""), false);
});

test("host turn observability records started completed and failed lifecycle events with host context", async (t) => {
  const root = await createTempWorkspace("operator-host-turn-events", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createPersistedSession(sessionStore, root);

  const completed = await runHostTurn(
    {
      host: "cli",
      input: "finish the task",
      cwd: root,
      stateRootDir: root,
      config,
      session,
      sessionStore,
    },
    {
      createToolRegistry: async () => ({
        definitions: [],
        async execute() {
          throw new Error("Unexpected tool execution.");
        },
      }),
      runTurn: async (options) => ({
        session: await options.sessionStore.save(options.session),
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      }),
    },
  );

  assert.equal(completed.status, "completed");

  const failed = await runHostTurn(
    {
      host: "interactive",
      input: "fail the task",
      cwd: root,
      stateRootDir: root,
      config,
      session: completed.session,
      sessionStore,
    },
    {
      createToolRegistry: async () => ({
        definitions: [],
        async execute() {
          throw new Error("Unexpected tool execution.");
        },
      }),
      runTurn: async () => {
        throw new Error("provider unreachable");
      },
    },
  );

  assert.equal(failed.status, "failed");

  const events = await readObservabilityEvents(root);
  const hostEvents = events.filter((event) => event.event === "host.turn");

  assert.deepEqual(
    hostEvents.map((event) => event.status),
    ["started", "completed", "started", "failed"],
  );
  assert.equal(hostEvents[0]?.host, "cli");
  assert.equal(hostEvents[1]?.sessionId, session.id);
  assert.equal(typeof hostEvents[1]?.durationMs, "number");
  assert.equal(hostEvents[2]?.host, "interactive");
  assert.match(String((hostEvents[3]?.error as { message?: unknown })?.message ?? ""), /provider unreachable/i);
  assert.equal((hostEvents[3]?.details as Record<string, unknown>)?.cwd, root);
});

test("doctor observability command prints the operator view without requiring a provider probe", async (t) => {
  const root = await createTempWorkspace("doctor-observability", t);
  const config = createTestRuntimeConfig(root);
  const paths = getProjectStatePaths(root);
  await fs.mkdir(paths.observabilityCrashesDir, { recursive: true });
  await fs.writeFile(
    path.join(paths.observabilityCrashesDir, "2026-04-13T01-02-03.000Z-999.json"),
    JSON.stringify({
      timestamp: "2026-04-13T01:02:03.000Z",
      pid: 999,
      message: "fatal boom",
      stack: "Error: fatal boom",
    }, null, 2),
    "utf8",
  );
  await appendObservabilityEvent(root, {
    event: "tool.execution",
    status: "failed",
    host: "cli",
    sessionId: "session-1",
    toolName: "run_shell",
    durationMs: 145,
    error: {
      message: "command failed",
      code: "ENOEXEC",
    },
    details: {
      changedPathCount: 0,
      verificationAttempted: true,
      verificationPassed: false,
    },
  });
  await appendObservabilityEvent(root, {
    event: "model.request",
    status: "completed",
    sessionId: "session-1",
    model: "deepseek-v4-flash",
    durationMs: 420,
    details: {
      provider: "deepseek",
      configuredModel: "deepseek-v4-flash",
      requestModel: "deepseek-v4-flash",
      usageAvailable: false,
      recoveryFallback: false,
    },
  });

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
  });

  const output = await captureStdout(async () => {
    await parseCommander(program, ["doctor", "observability"]);
  });

  assert.match(output, /observability/i);
  assert.match(output, new RegExp(paths.observabilityDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /recent event file/i);
  assert.match(output, /recent crashes: 1/i);
  assert.match(output, /run_shell/i);
  assert.match(output, /command failed/i);
  assert.match(output, /deepseek-v4-flash/i);
  assert.doesNotMatch(output, /provider reachable/i);
});
