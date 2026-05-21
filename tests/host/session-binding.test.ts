import assert from "node:assert/strict";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { ensureBoundSession, persistBoundSession } from "../../src/host/session.js";
import { createHostToolRegistry } from "../../src/host/toolRegistry.js";
import { SessionStore } from "../../src/session/store.js";
import type { RegisteredTool } from "../../src/tools/index.js";
import { getBuiltinTools } from "../../src/tools/toolCatalog.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("host session binding creates and persists a session binding", async (t) => {
  const root = await createTempWorkspace("host-session", t);
  const store = new SessionStore(getAppPaths(root).sessionsDir);
  let binding: { sessionId: string; touched: number } | null = null;

  const created = await ensureBoundSession({
    cwd: root,
    sessionStore: store,
    loadBinding: async () => binding,
    createBinding: (session) => ({ sessionId: session.id, touched: 0 }),
    touchBinding: (current, sessionId) => ({ sessionId, touched: current.touched + 1 }),
    saveBinding: async (next) => {
      binding = next;
    },
  });

  assert.equal(created.binding.sessionId, created.session.id);

  const next = await persistBoundSession({
    binding: created.binding,
    sessionId: created.session.id,
    touchBinding: (current, sessionId) => ({ sessionId, touched: current.touched + 1 }),
    saveBinding: async (saved) => {
      binding = saved;
    },
  });
  assert.equal(next.touched, 1);
});

test("host tool registry mounts extra tools as host tools beside the core surface", async (t) => {
  const root = await createTempWorkspace("host-tool-registry", t);
  const registry = await createHostToolRegistry(createTestRuntimeConfig(root), {
    extraTools: [createHostTestTool("host_extra")],
  });
  const names = registry.definitions.map((tool) => tool.function.name);
  const entry = registry.entries?.find((item) => item.name === "host_extra");

  assert.equal(names.includes("read"), true);
  assert.equal(names.includes("bash"), true);
  assert.equal(names.includes("host_extra"), true);
  assert.equal(entry?.origin.kind, "host");
  assert.equal(entry?.origin.sourceId, "host:extra-tools");
});

test("host tool registry can expose a focused core surface with extra workflow tools", async (t) => {
  const root = await createTempWorkspace("host-tool-registry-focused", t);
  const registry = await createHostToolRegistry(createTestRuntimeConfig(root), {
    builtinToolFilter: (tool) => {
      const name = tool.definition.function.name;
      return name === "read" || name === "bash";
    },
    extraTools: [createHostTestTool("spec_create")],
  });
  const names = registry.definitions.map((tool) => tool.function.name);

  const builtinNames = new Set(getBuiltinTools().map((tool) => tool.definition.function.name));
  assert.deepEqual(names.filter((name) => builtinNames.has(name)), ["read", "bash"]);
  assert.equal(names.includes("spec_create"), true);
});

function createHostTestTool(name: string): RegisteredTool {
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
