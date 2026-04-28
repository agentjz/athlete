import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { buildToolExecutionFailureResult } from "../../src/agent/turn/toolExecutor.js";
import { resolveToollessTurn } from "../../src/agent/turn/toolless.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import type { SkillRuntimeState } from "../../src/capabilities/skills/types.js";
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

test("tool execution failures expose facts without forcing a route-changing next action", () => {
  const result = buildToolExecutionFailureResult(
    {
      id: "call-1",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "missing.txt" }),
      },
    },
    new Error("ENOENT: no such file or directory, open 'missing.txt'"),
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.next_step, undefined);
  assert.match(String(payload.hint), /path used by read_file does not exist/i);
});

test("shutdown_response pending exposes request state without a strategy next step", async (t) => {
  const root = await createTempWorkspace("machine-shutdown-pending-whip", t);
  const request = await new ProtocolRequestStore(root).create({
    kind: "shutdown",
    from: "lead",
    to: "alpha",
    subject: "Graceful shutdown for alpha",
    content: "Please shut down gracefully.",
  });
  const registry = createToolRegistry();

  const result = await registry.execute(
    "shutdown_response",
    JSON.stringify({ request_id: request.id }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal((payload.request as Record<string, unknown>).status, "pending");
  assert.equal(payload.next_step, undefined);
});

test("run_shell runtime truncates long output into preview and persists full output as an artifact", async (t) => {
  const root = await createTempWorkspace("machine-shell-runtime-output", t);
  const registry = createToolRegistry();

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "node -e \"process.stdout.write('S'.repeat(14000))\"",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const outputPath = String(payload.outputPath ?? "");
  const outputPathAbsolute = path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);
  const persistedOutput = await fs.readFile(outputPathAbsolute, "utf8");

  assert.equal(result.ok, true);
  assert.equal(payload.status, "completed");
  assert.equal(payload.truncated, true);
  assert.equal(outputPath.length > 0, true);
  assert.equal(persistedOutput.length >= 14_000, true);
  assert.equal(String(payload.output ?? "").length < persistedOutput.length, true);
  assert.equal(result.metadata?.runtime?.truncated, true);
  assert.equal(result.metadata?.runtime?.outputPath, outputPath);
  assert.equal(result.metadata?.runtime?.status, "completed");
});

test("run_shell does not force potentially long commands into background_run", async (t) => {
  const root = await createTempWorkspace("machine-shell-long-command-foreground", t);
  const registry = createToolRegistry();

  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "node -e \"setTimeout(() => process.exit(0), 25)\"",
      timeout_ms: 1_000,
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.status, "completed");
  assert.notEqual(payload.code, "PREFER_BACKGROUND");
  assert.equal(result.metadata?.protocol?.status, "completed");
});
