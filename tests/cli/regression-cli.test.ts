import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { buildCliProgram } from "../../src/cli.js";
import { appendAgentTraceEvent } from "../../src/trace/store.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import { captureStdout, parseCommander } from "../observability.helpers.js";

test("regression cli captures and runs recorded evidence cases", async (t) => {
  const root = await createTempWorkspace("regression-cli", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.create(root);
  session = await sessionStore.save({
    ...session,
    messages: [
      { role: "assistant", content: "cli done", createdAt: new Date().toISOString() },
    ],
  });
  await appendAgentTraceEvent(root, {
    kind: "turn_started",
    sessionId: session.id,
    turnId: "turn-cli",
    summary: "started",
  });
  await appendAgentTraceEvent(root, {
    kind: "turn_finalized",
    sessionId: session.id,
    turnId: "turn-cli",
    summary: "finalized",
  });

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
  });

  const captureOutput = await captureStdout(async () => {
    await parseCommander(program, ["regression", "capture", session.id, "--case-id", "cli.case"]);
  });
  assert.match(captureOutput, /captured cli.case/);

  const casePath = path.join(root, ".kitty", "regression-cases", "cli.case.regression.json");
  const runOutput = await captureStdout(async () => {
    await parseCommander(program, ["regression", "run", casePath]);
  });
  assert.match(runOutput, /cli.case: passed/);
});
