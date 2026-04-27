import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { AgentTurnError } from "../../src/agent/errors.js";
import { MemorySessionStore } from "../../src/agent/session.js";
import { createPersistedSession, ensureBoundSession } from "../../src/host/session.js";
import { runHostTurn } from "../../src/host/turn.js";
import type { RegisteredTool, ToolRegistry } from "../../src/tools/types.js";
import { createTestRuntimeConfig } from "../helpers.js";

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("host-facing adapters stop importing raw turn and raw runtime registry directly", async () => {
  const guardedFiles: Array<{
    relativePath: string;
    forbidden: RegExp[];
  }> = [
    {
      relativePath: "src/cli/oneShot.ts",
      forbidden: [/runManagedAgentTurn/, /createRuntimeToolRegistry/],
    },
    {
      relativePath: "src/interaction/sessionDriver.ts",
      forbidden: [/runManagedAgentTurn/, /createRuntimeToolRegistry/],
    },
    {
      relativePath: "src/ui/interactive.ts",
      forbidden: [/runManagedAgentTurn/, /createRuntimeToolRegistry/, /runHostTurn/],
    },
    {
      relativePath: "src/telegram/turnRunner.ts",
      forbidden: [/runManagedAgentTurn/, /createRuntimeToolRegistry/],
    },
  ];

  for (const guarded of guardedFiles) {
    const source = await readSource(guarded.relativePath);
    for (const pattern of guarded.forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${guarded.relativePath} should stop depending on ${pattern} and go through src/host/`,
      );
    }
  }
});

test("shared host turn boundary injects extra tools through one registry path and always closes it", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await createPersistedSession(sessionStore, cwd);
  const seenExtraTools: string[] = [];
  let registryClosed = 0;

  const outcome = await runHostTurn(
    {
      input: "ship the reply",
      cwd,
      config,
      session,
      sessionStore,
      extraTools: [createExtraTool("send_file")],
    },
    {
      createToolRegistry: async (_config, options) => {
        seenExtraTools.push(...(options.extraTools ?? []).map((tool) => tool.definition.function.name));
        return {
          definitions: [],
          async execute() {
            throw new Error("Unexpected tool execution in host boundary test.");
          },
          async close() {
            registryClosed += 1;
          },
        } satisfies ToolRegistry;
      },
      runTurn: async (options) => {
        assert.equal(seenExtraTools.includes("send_file"), true);
        assert.equal(Boolean(options.toolRegistry), true);
        return {
          session: await options.sessionStore.save({
            ...options.session,
            title: "shared-host-turn",
          }),
          changedPaths: [],
          verificationAttempted: false,
          yielded: false,
        };
      },
    },
  );

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.session.title, "shared-host-turn");
  assert.deepEqual(seenExtraTools, ["send_file"]);
  assert.equal(registryClosed, 1);
});

test("shared host turn boundary turns managed-turn failures into structured host outcomes", async () => {
  const cwd = process.cwd();
  const config = createTestRuntimeConfig(cwd);
  const sessionStore = new MemorySessionStore();
  const session = await createPersistedSession(sessionStore, cwd);

  const outcome = await runHostTurn(
    {
      input: "break on purpose",
      cwd,
      config,
      session,
      sessionStore,
    },
    {
      createToolRegistry: async () => ({
        definitions: [],
        async execute() {
          throw new Error("Unexpected tool execution in host boundary failure test.");
        },
      }),
      runTurn: async (options) => {
        const persisted = await options.sessionStore.save({
          ...options.session,
          title: "failed-turn-session",
        });
        throw new AgentTurnError("provider unreachable", persisted);
      },
    },
  );

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorMessage, "provider unreachable");
  assert.equal(outcome.session.title, "failed-turn-session");
});

test("shared host session boundary recreates missing bound sessions without inventing a second session truth source", async () => {
  const cwd = process.cwd();
  const sessionStore = new MemorySessionStore();
  let binding: { peerKey: string; sessionId: string; updatedAt: string } | null = {
    peerKey: "telegram:private:1001",
    sessionId: "missing-session",
    updatedAt: "2026-04-11T00:00:00.000Z",
  };

  const ensured = await ensureBoundSession({
    cwd,
    sessionStore,
    loadBinding: async () => binding,
    createBinding: (session) => ({
      peerKey: "telegram:private:1001",
      sessionId: session.id,
      updatedAt: "2026-04-11T00:00:00.000Z",
    }),
    touchBinding: (currentBinding, sessionId) => ({
      ...currentBinding,
      sessionId,
      updatedAt: "2026-04-11T01:00:00.000Z",
    }),
    saveBinding: async (nextBinding) => {
      binding = nextBinding;
    },
  });

  assert.notEqual(ensured.session.id, "missing-session");
  assert.equal(binding?.sessionId, ensured.session.id);
  assert.equal(binding?.peerKey, "telegram:private:1001");
});

function createExtraTool(name: string): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: `${name} test tool`,
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    async execute() {
      return {
        ok: true,
        output: "ok",
      };
    },
  };
}
