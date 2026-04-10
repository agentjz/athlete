import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { TaskStore } from "../src/tasks/store.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

test("runManagedAgentTurn keeps continuation behavior after lead orchestration seeds the task board", async (t) => {
  const root = await createTempWorkspace("orchestrator-managed", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.save({
    ...(await sessionStore.create(root)),
    checkpoint: createCheckpointFixture("Refactor the CLI flow and validate the runtime behavior afterwards.", {
      completedSteps: ["Seeded the persistent task board"],
      nextStep: "Continue the active implementation task instead of reseeding the plan.",
      flow: {
        phase: "continuation",
      },
    }),
  } as any);
  const seenInputs: string[] = [];
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "Refactor the CLI flow and validate the runtime behavior afterwards.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session: initialSession,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: sliceCount === 1,
      };
    },
  });

  const tasks = await new TaskStore(root).list();
  assert.equal(sliceCount, 2);
  assert.equal(result.yielded, false);
  assert.equal(seenInputs[0], "Refactor the CLI flow and validate the runtime behavior afterwards.");
  assert.match(String(seenInputs[1]), /Seeded the persistent task board/i);
  assert.match(String(seenInputs[1]), /Continue the active implementation task/i);
  assert.ok(tasks.length >= 2);
});
