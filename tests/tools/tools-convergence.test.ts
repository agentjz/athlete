import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildSystemPromptLayers, renderPromptLayers } from "../../src/agent/promptSections.js";
import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { createRuntimeToolRegistry } from "../../src/capabilities/tools/core/runtimeRegistry.js";
import type { ProjectContext } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo, makeToolContext } from "../helpers.js";

const FOUNDATION_TOOLS = ["read", "edit", "write", "bash"] as const;

function createProjectContext(root: string): ProjectContext {
  return {
    rootDir: root,
    stateRootDir: root,
    cwd: root,
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    skills: [],
    ignoreRules: [],
  };
}

test("agent registry exposes only the four foundation tools", async () => {
  const root = process.cwd();
  const registry = await createRuntimeToolRegistry(
    createTestRuntimeConfig(root),
    { onlyNames: FOUNDATION_TOOLS },
    {
      collectMcpSources: async () => [],
      close: async () => undefined,
    },
  );

  assert.deepEqual(new Set(registry.definitions.map((tool) => tool.function.name)), new Set(FOUNDATION_TOOLS));
  await registry.close?.();
});

test("tool registry execute still works after destructuring", async (t) => {
  const root = await createTempWorkspace("tool-registry-destructure", t);
  await fs.writeFile(path.join(root, "hello.txt"), "hello\n", "utf8");
  const registry = createToolRegistry({ onlyNames: ["read"] });
  const { execute } = registry;

  const result = await execute(
    "read",
    JSON.stringify({ path: path.join(root, "hello.txt"), offset: 1, limit: 5 }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  assert.match(result.output, /hello/);
});

test("foundation tools cover locate, read, edit, diff, and test through bash", async (t) => {
  const root = await createTempWorkspace("foundation-four-tools", t);
  await initGitRepo(root);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "math.ts"), "export const value = 1;\n", "utf8");
  const baseline = createToolRegistry({ onlyNames: FOUNDATION_TOOLS });
  await baseline.execute(
    "bash",
    JSON.stringify({ command: "git add src/math.ts && git commit -m baseline", timeout_ms: 30_000 }),
    makeToolContext(root, root) as never,
  );

  const registry = createToolRegistry({ onlyNames: FOUNDATION_TOOLS });
  const locate = await registry.execute(
    "bash",
    JSON.stringify({ command: "rg \"value\" src", timeout_ms: 30_000 }),
    makeToolContext(root, root) as never,
  );
  const read = await registry.execute(
    "read",
    JSON.stringify({ path: "src/math.ts", offset: 1, limit: 5 }),
    makeToolContext(root, root) as never,
  );
  const edit = await registry.execute(
    "edit",
    JSON.stringify({
      path: "src/math.ts",
      edits: [{ oldText: "export const value = 1;", newText: "export const value = 2;", line: 1 }],
    }),
    makeToolContext(root, root) as never,
  );
  const diff = await registry.execute(
    "bash",
    JSON.stringify({ command: "git diff -- src/math.ts", timeout_ms: 30_000 }),
    makeToolContext(root, root) as never,
  );
  const verify = await registry.execute(
    "bash",
    JSON.stringify({ command: "node -e \"console.log('ok')\"", timeout_ms: 30_000 }),
    makeToolContext(root, root) as never,
  );

  assert.equal(locate.ok, true);
  assert.match(locate.output, /value/);
  assert.equal(read.ok, true);
  assert.match(read.output, /1 \| export const value = 1;/);
  assert.equal(edit.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "math.ts"), "utf8"), "export const value = 2;\n");
  assert.equal(diff.ok, true);
  assert.match(diff.output, /\+export const value = 2;/);
  assert.equal(verify.ok, true);
});

test("read returns continuation without identity or anchor protocol", async (t) => {
  const root = await createTempWorkspace("read-continuation", t);
  await fs.writeFile(path.join(root, "big.txt"), ["one", "two", "three"].join("\n"), "utf8");

  const registry = createToolRegistry({ onlyNames: FOUNDATION_TOOLS });
  const result = await registry.execute(
    "read",
    JSON.stringify({ path: "big.txt", offset: 1, limit: 2 }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(payload, "identity"), false);
  assert.equal(Object.hasOwn(payload, "anchors"), false);
  assert.match(String(payload.content ?? ""), /2 \| two/);
  assert.deepEqual((payload.continuation as Record<string, unknown>).continuationArgs, {
    path: "big.txt",
    offset: 3,
    limit: 2,
  });
});

test("edit schema uses oldText and newText only", () => {
  const registry = createToolRegistry({ onlyNames: FOUNDATION_TOOLS });
  const definition = registry.definitions.find((tool) => tool.function.name === "edit");
  assert(definition?.function.parameters && "properties" in definition.function.parameters);
  const parameters = definition.function.parameters as { properties: Record<string, unknown> };
  const edits = parameters.properties.edits as {
    items?: {
      properties?: Record<string, unknown>;
    };
  };
  const properties = edits.items?.properties ?? {};

  assert.equal(Object.hasOwn(properties, "oldText"), true);
  assert.equal(Object.hasOwn(properties, "newText"), true);
  assert.equal(Object.hasOwn(properties, "line"), true);
  assert.equal(Object.hasOwn(properties, "anchor"), false);
});

test("model-visible projection stays short for the four tools", () => {
  const readProjection = projectToolResultForModel({
    toolName: "read",
    result: {
      ok: true,
      output: JSON.stringify({
        path: "a.ts",
        readable: true,
        startLine: 1,
        endLine: 1,
        content: "1 | const a = 1;",
      }),
    },
  });
  const bashProjection = projectToolResultForModel({
    toolName: "bash",
    result: {
      ok: true,
      output: JSON.stringify({
        exitCode: 0,
        durationMs: 5,
        status: "completed",
        output: "ok\n",
      }),
    },
  });

  assert.match(readProjection, /a\.ts:1-1/);
  assert.match(bashProjection, /exit 0 in 5ms/);
});

test("agent prompt teaches the four-tool loop and omits deleted foundation tools", () => {
  const root = process.cwd();
  const prompt = renderPromptLayers(
    buildSystemPromptLayers(
      root,
      createTestRuntimeConfig(root),
      createProjectContext(root),
    ),
  );

  assert.match(prompt, /bash locate facts -> read focused file windows -> edit\/write -> bash git diff\/test/i);
  assert.match(prompt, /Use bash for search, listing, git status, git diff, builds, tests/i);
});

