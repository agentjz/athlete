import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { processToolCallBatch } from "../../src/agent/turn/toolBatchLifecycle.js";
import { ToolLoopGuard } from "../../src/agent/turn/loopGuard.js";
import { ChangeStore } from "../../src/changes/store.js";
import type { ToolRegistry } from "../../src/capabilities/tools/core/types.js";
import { loadProjectContext } from "../../src/context/projectContext.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("failed observation verification metadata is recorded as fact without creating a closeout gate", async (t) => {
  const root = await createTempWorkspace("verification-observation-noise", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const config = createTestRuntimeConfig(root);
  const projectContext = await loadProjectContext(root);
  const toolRegistry: ToolRegistry = {
    definitions: [],
    execute: async () => ({
      ok: true,
      output: JSON.stringify({ ok: false, status: 404 }),
      metadata: {
        verification: {
          attempted: true,
          command: "GET http://127.0.0.1/missing",
          exitCode: 404,
          kind: "http_probe",
          passed: false,
        },
      },
    }),
  };

  const result = await processToolCallBatch({
    session,
    response: {
      content: "Checking endpoint.",
      toolCalls: [{
        id: "call-1",
        type: "function",
        function: {
          name: "http_probe",
          arguments: JSON.stringify({ url: "http://127.0.0.1/missing" }),
        },
      }],
    },
    options: {
      input: "Demonstrate capabilities.",
      cwd: root,
      config,
      session,
      sessionStore,
    },
    identity: { kind: "lead", name: "lead" },
    toolRegistry,
    projectContext,
    changeStore: new ChangeStore(config.paths.changesDir),
    loopGuard: new ToolLoopGuard(),
    changedPaths: new Set(),
    validationAttempted: false,
    validationPassed: false,
    roundsSinceTodoWrite: 0,
  });

  assert.equal(result.validationAttempted, true);
  assert.equal(result.validationPassed, false);
  assert.equal(result.session.verificationState?.status, "failed");
});
