import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { buildToolExecutionFailureResult } from "../../src/agent/turn/toolExecutor.js";
import { resolveToollessTurn } from "../../src/agent/turn/toolless.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import { finalizeToolExecution } from "../../src/capabilities/tools/core/toolFinalize.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import type { ToolRegistryEntry } from "../../src/capabilities/tools/core/types.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ProtocolRequestStore } from "../../src/capabilities/team/requestStore.js";
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
      secondaryInWorkflows: [],
    },
  };
}

test("background_terminate is idempotent for already-terminal background jobs", async (t) => {
  const root = await createTempWorkspace("machine-background-terminate-idempotent", t);
  const registry = createToolRegistry();
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
    verificationState: session.verificationState,
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

test("toolless visible output finalizes without skill-driven continuation", async () => {
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());

  const outcome = await resolveToollessTurn({
    session,
    response: {
      content: "I should think about the document workflow.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set<string>(),
    options: {
      input: "Review proposal.docx",
      cwd: process.cwd(),
      config: createTestRuntimeConfig(process.cwd()),
      session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "return");
  if (outcome.kind === "return") {
    assert.equal(outcome.result.transition?.reason.code, "finalize.completed");
  }
});
