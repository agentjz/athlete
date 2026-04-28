import assert from "node:assert/strict";
import test from "node:test";

import { launchSubagentWorkerExecution } from "../../src/capabilities/subagent/launch.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { taskTool } from "../../src/capabilities/tools/packages/tasks/taskTool.js";
import { TaskStore } from "../../src/tasks/store.js";
import type { ToolContext } from "../../src/capabilities/tools/core/types.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("launchSubagentWorkerExecution creates a worker-backed subagent execution", async (t) => {
  const root = await createTempWorkspace("subagent-worker-launch", t);
  const config = createTestRuntimeConfig(root);
  const task = await new TaskStore(root).create("survey execution model", "");
  let spawnInput: { executionId: string; actorName?: string } | undefined;

  const { execution, pid } = await launchSubagentWorkerExecution({
    rootDir: root,
    cwd: root,
    config,
    description: "survey execution model",
    objective: "Find the concrete execution path and report facts.",
    scope: "Subagent launch path only.",
    expectedOutput: "CloseoutContract with facts.",
    agentType: "explore",
    taskId: task.id,
    actorName: `subagent-${task.id}`,
    worktreePolicy: "none",
  }, {
    spawnExecutionWorker: (input) => {
      spawnInput = {
        executionId: input.executionId,
        actorName: input.actorName,
      };
      return 1357;
    },
  });

  const stored = await new ExecutionStore(root).load(execution.id);

  assert.equal(pid, 1357);
  assert.equal(spawnInput?.executionId, execution.id);
  assert.equal(spawnInput?.actorName, `subagent-${task.id}`);
  assert.equal(stored.profile, "subagent");
  assert.equal(stored.launch, "worker");
  assert.equal(stored.status, "running");
  assert.equal(stored.pid, 1357);
  assert.equal(stored.taskId, task.id);
  assert.equal(stored.boundary.protocol, "deadmouse.execution-boundary");
  assert.equal(stored.boundary.onBoundary, "return_to_lead_review");
});

test("task tool launches a subagent execution and returns a Lead handoff", async (t) => {
  const root = await createTempWorkspace("task-tool-subagent-worker", t);
  const result = await taskTool.execute(
    JSON.stringify({
      description: "inspect dispatch",
      objective: "Check whether dispatch is worker-backed.",
      scope: "Task tool dispatch path only.",
      expected_output: "CloseoutContract with worker evidence.",
      agent_type: "explore",
    }),
    makeToolContext(root) as unknown as ToolContext,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const executionId = String(payload.executionId ?? "");
  const stored = await new ExecutionStore(root).load(executionId);

  assert.equal(result.ok, true);
  assert.equal(payload.status, "launched");
  assert.equal(typeof payload.content, "undefined");
  assert.equal(payload.nextAction, undefined);
  assert.equal(stored.profile, "subagent");
  assert.equal(stored.launch, "worker");
  assert.equal(stored.status, "running");
  assert.equal(stored.requestedBy, "lead");
  assert.equal(stored.pid, process.pid);
});

test("task tool blocks non-Lead agents from spawning nested command paths", async (t) => {
  const root = await createTempWorkspace("task-tool-non-lead", t);
  await assert.rejects(
    () => taskTool.execute(
      JSON.stringify({
        description: "nested work",
        objective: "Try to create another execution channel.",
        scope: "Nested dispatch guard only.",
        expected_output: "CloseoutContract with guard result.",
        agent_type: "explore",
      }),
      makeToolContext(root, root, {
        identity: {
          kind: "teammate",
          name: "worker-1",
        },
      }) as unknown as ToolContext,
    ),
    /Only the lead can launch subagent executions/i,
  );
});
