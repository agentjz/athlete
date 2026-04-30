import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { appendAgentTraceEvent, listAgentTraceSessions } from "../../src/trace/store.js";
import { buildCliProgram } from "../../src/cli.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createPersistedSession } from "../../src/host/session.js";
import { buildRuntimeDoctorReport, formatRuntimeDoctorReport } from "../../src/doctor/runtimeDoctor.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import { captureStdout, parseCommander } from "../observability.helpers.js";

test("runtime doctor reports capability governance provider profile recovery trace and execution facts", async (t) => {
  const root = await createTempWorkspace("runtime-doctor", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createPersistedSession(sessionStore, root);
  const saved = await sessionStore.save({
    ...session,
    checkpoint: {
      ...session.checkpoint!,
      objective: "recover from durable facts",
      completedSteps: ["read facts"],
      flow: {
        ...session.checkpoint!.flow,
        phase: "resume",
        reason: "test resume",
      },
      evidenceArtifacts: [{
        kind: "tool_preview",
        label: "artifact",
        path: "README.md",
      }],
    },
    runtimeStats: {
      ...session.runtimeStats!,
      events: {
        ...session.runtimeStats!.events,
        recoveryCount: 2,
        yieldCount: 1,
      },
    },
  });

  await appendAgentTraceEvent(root, {
    kind: "turn_started",
    sessionId: saved.id,
    turnId: "turn-1",
    summary: "turn started",
  });

  const executionStore = new ExecutionStore(root);
  await executionStore.create({
    id: "execdoctor1",
    lane: "agent",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background",
    cwd: root,
  });

  const traceSessions = await listAgentTraceSessions(root);
  assert.equal(traceSessions[0]?.eventCount, 1);

  const report = await buildRuntimeDoctorReport({
    rootDir: root,
    cwd: root,
    config,
    sessionStore,
  });

  assert.equal(report.status, "ok");
  assert.equal(report.provider.modelProfile.provider, "deepseek");
  assert.equal(report.provider.modelProfile.harnessSurface.reasoningVisibleToHarness, true);
  assert.equal(report.capabilities.total > 0, true);
  assert.equal((report.capabilities.byKind.tool ?? 0) > 0, true);
  assert.equal(report.mcp.status, "disabled");
  assert.equal(report.skills.count >= 0, true);
  assert.equal(report.recovery.latestSession?.sessionId, saved.id);
  assert.equal(report.recovery.latestSession?.checkpointPhase, "resume");
  assert.equal(report.recovery.latestSession?.traceEvents, 1);
  assert.equal(report.execution.total, 1);
  assert.equal(report.execution.active, 1);

  const formatted = formatRuntimeDoctorReport(report).join("\n");
  assert.match(formatted, /Runtime doctor/i);
  assert.match(formatted, /model profile/i);
  assert.match(formatted, /capability packages/i);
  assert.match(formatted, /recovery facts/i);
  assert.match(formatted, /trace sessions/i);
  assert.doesNotMatch(formatted, /provider reachable/i);
});

test("runtime doctor cli uses the structured report without provider probing", async (t) => {
  const root = await createTempWorkspace("runtime-doctor-cli", t);
  const config = createTestRuntimeConfig(root);
  await fs.mkdir(config.paths.sessionsDir, { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "# runtime doctor\n", "utf8");

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
  });

  const output = await captureStdout(async () => {
    await parseCommander(program, ["doctor", "runtime"]);
  });

  assert.match(output, /Runtime doctor/i);
  assert.match(output, /capability packages/i);
  assert.match(output, /model profile/i);
  assert.match(output, /recovery facts/i);
  assert.doesNotMatch(output, /Provider reachable/i);
});
