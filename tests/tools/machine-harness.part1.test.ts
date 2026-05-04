import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { InProcessSessionStore } from "../../src/agent/session.js";
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

test("read returns focused content, edit uses target text, and unrelated file changes do not block edits", async (t) => {
  const root = await createTempWorkspace("machine-identity", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "alpha\nbeta\ngamma\n", "utf8");

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  assert.match(String(readPayload.content ?? ""), /2 \| beta/);
  assert.equal(Object.hasOwn(readPayload, "identity"), false);
  assert.equal(Object.hasOwn(readPayload, "anchors"), false);
  assert.deepEqual(readResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(readResult.metadata?.protocol?.policy, "parallel");

  await fs.writeFile(filePath, "alpha\nbeta\nGAMMA\n", "utf8");
  const editResult = await registry.execute(
    "edit",
    JSON.stringify({
      path: "story.txt",
      edits: [
        {
          oldText: "beta",
          newText: "BETA",
          line: 2,
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );
  const editPayload = JSON.parse(editResult.output) as Record<string, unknown>;

  assert.equal(editResult.ok, true);
  assert.equal(Object.hasOwn(editPayload, "identityChangedBeforeEdit"), false);
  assert.equal(Object.hasOwn(editPayload, "absoluteChangedPaths"), false);
  assert.deepEqual(editResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);
  assert.equal(editResult.metadata?.protocol?.policy, "sequential");
  assert.equal(await fs.readFile(filePath, "utf8"), "alpha\nBETA\nGAMMA\n");

  await fs.writeFile(filePath, "alpha\nbeta changed\nGAMMA\n", "utf8");
  await assert.rejects(
    () =>
      registry.execute(
        "edit",
        JSON.stringify({
          path: "story.txt",
          edits: [
            {
              oldText: "beta\n",
              newText: "BETA",
              line: 2,
            },
          ],
        }),
        makeToolContext(root, root) as never,
      ),
    /could not find edit/i,
  );
});

test("write can overwrite existing files and records the change instead of blocking speed", async (t) => {
  const root = await createTempWorkspace("machine-write-overwrite", t);
  await fs.writeFile(path.join(root, "existing.txt"), "old\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "write",
    JSON.stringify({
      path: "existing.txt",
      content: "new\n",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.existed, true);
  assert.match(String(payload.diff ?? ""), /\+ new/);
  assert.equal(await fs.readFile(path.join(root, "existing.txt"), "utf8"), "new\n");
  assert.equal(result.metadata?.protocol?.status, "completed");
});

test("bash allows direct shell reads when the model chooses that fast route", async (t) => {
  const root = await createTempWorkspace("machine-shell-read", t);
  await fs.writeFile(path.join(root, "notes.txt"), "alpha\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "bash",
    JSON.stringify({
      command: "Get-Content notes.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.exitCode, 0);
  assert.match(String(payload.output ?? ""), /alpha/);
  assert.equal(result.metadata?.protocol?.status, "completed");
});

test("blocked tool results include a factual hint without a strategy next step", async () => {
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
  assert.equal(payload.next_step, undefined);
});



