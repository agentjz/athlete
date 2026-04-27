import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { buildToolExecutionFailureResult } from "../../src/agent/turn/toolExecutor.js";
import { resolveToollessTurn } from "../../src/agent/turn/toolless.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import type { SkillRuntimeState } from "../../src/skills/types.js";
import { finalizeToolExecution } from "../../src/tools/toolFinalize.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import type { ToolRegistryEntry } from "../../src/tools/types.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ProtocolRequestStore } from "../../src/team/requestStore.js";
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
      fallbackOnlyInWorkflows: [],
    },
  };
}

test("read_file emits a stable identity, edit_file uses it, and stale identities are rejected", async (t) => {
  const root = await createTempWorkspace("machine-identity", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "alpha\nbeta\ngamma\n", "utf8");

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  const identity = readPayload.identity as Record<string, unknown>;
  const anchors = readPayload.anchors as Array<Record<string, unknown>>;
  const betaAnchor = anchors.find((anchor) => anchor.line === 2);

  assert.equal(typeof identity.sha256, "string");
  assert.equal(identity.path, filePath);
  assert.ok(betaAnchor);
  assert.deepEqual(readResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(readResult.metadata?.protocol?.policy, "parallel");

  await fs.writeFile(filePath, "header\nalpha\nbeta\ngamma\n", "utf8");
  await assert.rejects(
    () =>
      registry.execute(
        "edit_file",
        JSON.stringify({
          path: "story.txt",
          expected_identity: identity,
          edits: [
            {
              anchor: betaAnchor,
              old_string: "beta",
              new_string: "BETA",
            },
          ],
        }),
        makeToolContext(root, root) as never,
      ),
    /stale/i,
  );

  const refreshedRead = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const refreshedIdentity = (JSON.parse(refreshedRead.output) as Record<string, unknown>).identity;
  const refreshedAnchors = (JSON.parse(refreshedRead.output) as Record<string, unknown>).anchors as Array<Record<string, unknown>>;
  const refreshedBetaAnchor = refreshedAnchors.find((anchor) => anchor.line === 3);
  const editResult = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: refreshedIdentity,
      edits: [
        {
          anchor: refreshedBetaAnchor,
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(editResult.ok, true);
  assert.ok(refreshedBetaAnchor);
  assert.deepEqual(editResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(editResult.metadata?.protocol?.policy, "sequential");
  assert.match(await fs.readFile(filePath, "utf8"), /BETA/);
});

test("write_file blocks overwriting existing files during prepare and points the model back to edit_file", async (t) => {
  const root = await createTempWorkspace("machine-write-guard", t);
  await fs.writeFile(path.join(root, "existing.txt"), "old\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "write_file",
    JSON.stringify({
      path: "existing.txt",
      content: "new\n",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "WRITE_EXISTING_FILE_BLOCKED");
  assert.match(String(payload.hint ?? ""), /edit_file/i);
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.deepEqual(result.metadata?.protocol?.phases, ["prepare", "finalize"]);
  assert.equal(result.metadata?.protocol?.blockedIn, "prepare");
  assert.equal(result.metadata?.protocol?.guardCode, "WRITE_EXISTING_FILE_BLOCKED");
});

test("run_shell blocks direct shell file reads and routes them back to read_file", async (t) => {
  const root = await createTempWorkspace("machine-shell-guard", t);
  await fs.writeFile(path.join(root, "notes.txt"), "alpha\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "run_shell",
    JSON.stringify({
      command: "Get-Content notes.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "SHELL_FILE_READ_BLOCKED");
  assert.match(String(payload.hint ?? ""), /read_file/i);
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.deepEqual(result.metadata?.protocol?.phases, ["prepare", "finalize"]);
  assert.equal(result.metadata?.protocol?.blockedIn, "prepare");
});

test("blocked tool results always include a continuation exit", async () => {
  const result = finalizeToolExecution(
    createBlockedToolEntry(),
    {
      ok: false,
      output: JSON.stringify({
        ok: false,
        code: "TEST_BLOCKED_WITHOUT_EXIT",
        error: "blocked without continuation fields",
      }),
    },
    {
      policy: "sequential",
      rawArgs: "{}",
      argumentStrictness: {
        tier: "L2",
        unknownArgsStripped: [],
        warning: false,
      },
    },
    {
      status: "blocked",
      blockedIn: "prepare",
    },
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.metadata?.protocol?.status, "blocked");
  assert.equal(typeof payload.hint, "string");
  assert.equal(typeof payload.next_step, "string");
  assert.match(String(payload.next_step), /continue|retry|choose|adjust/i);
});
