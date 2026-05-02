import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { appendAgentTraceEvent } from "../../src/trace/store.js";
import { captureRegressionCase, runRegressionCases } from "../../src/regression/store.js";
import { createTempWorkspace } from "../helpers.js";

test("regression cases capture session and trace evidence and run deterministic checks", async (t) => {
  const root = await createTempWorkspace("regression-case", t);
  const sessionsDir = path.join(root, "sessions");
  const sessionStore = new SessionStore(sessionsDir);
  let session = await sessionStore.create(root);
  session = await sessionStore.save({
    ...session,
    messages: [
      { role: "user", content: "do work", createdAt: new Date().toISOString() },
      { role: "assistant", content: "work done", createdAt: new Date().toISOString() },
    ],
  });

  await appendAgentTraceEvent(root, {
    kind: "turn_started",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "started",
  });
  await appendAgentTraceEvent(root, {
    kind: "model_request",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "request",
  });
  await appendAgentTraceEvent(root, {
    kind: "model_response",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "response",
  });
  await appendAgentTraceEvent(root, {
    kind: "turn_finalized",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "finalized",
  });

  const captured = await captureRegressionCase({
    rootDir: root,
    sessionsDir,
    sessionId: session.id,
    caseId: "core.behavior",
  });
  assert.equal(captured.regressionCase.caseId, "core.behavior");
  assert.equal(captured.regressionCase.evidence.traceEventCount, 4);
  assert.equal(captured.regressionCase.expectations.finalAssistantText, "work done");

  const results = await runRegressionCases({
    rootDir: root,
    sessionsDir,
    casePath: captured.casePath,
  });
  assert.deepEqual(results.map((result) => result.status), ["passed"]);
});

test("regression case runner reports missing captured trace facts", async (t) => {
  const root = await createTempWorkspace("regression-case-failure", t);
  const sessionsDir = path.join(root, "sessions");
  const sessionStore = new SessionStore(sessionsDir);
  let session = await sessionStore.create(root);
  session = await sessionStore.save({
    ...session,
    messages: [
      { role: "assistant", content: "done", createdAt: new Date().toISOString() },
    ],
  });
  await appendAgentTraceEvent(root, {
    kind: "turn_started",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "started",
  });
  await appendAgentTraceEvent(root, {
    kind: "turn_finalized",
    sessionId: session.id,
    turnId: "turn-a",
    summary: "finalized",
  });
  const captured = await captureRegressionCase({
    rootDir: root,
    sessionsDir,
    sessionId: session.id,
  });

  const traceFile = path.join(root, ".kitty", "traces", `${session.id}.jsonl`);
  await import("node:fs/promises").then((fs) => fs.writeFile(traceFile, "", "utf8"));

  const results = await runRegressionCases({
    rootDir: root,
    sessionsDir,
    casePath: captured.casePath,
  });
  assert.equal(results[0]?.status, "failed");
  assert.match(results[0]?.failures.join("\n") ?? "", /trace event count regressed/);
});
