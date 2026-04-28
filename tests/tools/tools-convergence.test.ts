import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildSystemPromptLayers, renderPromptLayers } from "../../src/agent/promptSections.js";
import { prioritizeToolDefinitionsForTurn } from "../../src/agent/toolPriority.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { createRuntimeToolRegistry } from "../../src/capabilities/tools/core/runtimeRegistry.js";
import type { ProjectContext } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

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

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function sortedToolNames(names: string[]): string[] {
  return [...names].sort((left, right) => left.localeCompare(right));
}

test("find_files is exposed through the formal runtime registry as a governed builtin read tool", async () => {
  const root = process.cwd();
  const registry = await createRuntimeToolRegistry(
    createTestRuntimeConfig(root),
    {},
    {
      collectMcpSources: async () => [],
      close: async () => undefined,
    },
  );

  const entry = registry.entries?.find((item) => item.name === "find_files");
  assert(entry);
  assert.equal(entry.origin.kind, "builtin");
  assert.equal(entry.governance.source, "builtin");
  assert.equal(entry.governance.mutation, "read");
  assert.equal(entry.governance.changeSignal, "none");
  await registry.close?.();
});

test("turn-time tool prioritization reorders tools without reducing the visible tool set", async () => {
  const registry = await createRuntimeToolRegistry(
    createTestRuntimeConfig(process.cwd()),
    {},
    {
      collectMcpSources: async () => [],
      close: async () => undefined,
    },
  );
  const originalNames = registry.definitions.map((tool) => tool.function.name);

  const prioritized = prioritizeToolDefinitionsForTurn(registry.definitions, {
    input: "Open https://example.com in the browser and inspect the page.",
  });
  const prioritizedNames = prioritized.map((tool) => tool.function.name);

  assert.deepEqual(sortedToolNames(prioritizedNames), sortedToolNames(originalNames));
  assert.equal(new Set(prioritizedNames).size, new Set(originalNames).size);
  await registry.close?.();
});

test("find_files returns relative path matches without collapsing into list_files or search_files payload semantics", async (t) => {
  const root = await createTempWorkspace("find-files", t);
  await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "nested", "alpha.test.ts"), "export const alpha = 1;\n", "utf8");
  await fs.writeFile(path.join(root, "src", "nested", "alpha.ts"), "export const beta = 2;\n", "utf8");
  await fs.writeFile(path.join(root, "README.md"), "# readme\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "find_files",
    JSON.stringify({
      path: ".",
      pattern: "**/*.test.ts",
      limit: 10,
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.deepEqual(
    Array.isArray(payload.files) ? payload.files.map((value) => normalizeSlashes(String(value))) : [],
    ["src/nested/alpha.test.ts"],
  );
  assert.equal(Array.isArray(payload.entries), false);
  assert.equal(Array.isArray(payload.matches), false);
});

test("edit_file rejects overlapping edits that target the same original file region", async (t) => {
  const root = await createTempWorkspace("edit-file-overlap", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "alpha\nbeta\ngamma\ndelta\n", "utf8");

  const registry = createToolRegistry();
  const { identity, anchors } = await readFileState(registry, root, "story.txt");
  const betaAnchor = anchors.find((anchor) => anchor.line === 2);
  const gammaAnchor = anchors.find((anchor) => anchor.line === 3);
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
              old_string: "beta\ngamma",
              new_string: "BETA\nGAMMA",
            },
            {
              anchor: gammaAnchor,
              old_string: "gamma\ndelta",
              new_string: "GAMMA\nDELTA",
            },
          ],
        }),
        makeToolContext(root, root) as never,
      ),
    /overlap/i,
  );
});

test("edit_file returns a deterministic diff preview for the same batched edit plan", async (t) => {
  const root = await createTempWorkspace("edit-file-diff", t);
  await fs.writeFile(path.join(root, "a.txt"), "alpha\nbeta\ngamma\ndelta\n", "utf8");
  await fs.writeFile(path.join(root, "b.txt"), "alpha\nbeta\ngamma\ndelta\n", "utf8");

  const registry = createToolRegistry();
  const firstState = await readFileState(registry, root, "a.txt");
  const secondState = await readFileState(registry, root, "b.txt");
  const firstBetaAnchor = firstState.anchors.find((anchor) => anchor.line === 2);
  const firstDeltaAnchor = firstState.anchors.find((anchor) => anchor.line === 4);
  const secondBetaAnchor = secondState.anchors.find((anchor) => anchor.line === 2);
  const secondDeltaAnchor = secondState.anchors.find((anchor) => anchor.line === 4);
  const args = JSON.stringify({
    edits: [
      {
        anchor: firstBetaAnchor,
        old_string: "beta",
        new_string: "BETA",
      },
      {
        anchor: firstDeltaAnchor,
        old_string: "delta",
        new_string: "DELTA",
      },
    ],
  });

  const first = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "a.txt",
      expected_identity: firstState.identity,
      ...JSON.parse(args),
    }),
    makeToolContext(root, root) as never,
  );
  const second = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "b.txt",
      expected_identity: secondState.identity,
      edits: [
        {
          anchor: secondBetaAnchor,
          old_string: "beta",
          new_string: "BETA",
        },
        {
          anchor: secondDeltaAnchor,
          old_string: "delta",
          new_string: "DELTA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );

  const firstPayload = JSON.parse(first.output) as Record<string, unknown>;
  const secondPayload = JSON.parse(second.output) as Record<string, unknown>;

  assert.equal(firstPayload.appliedEdits, 2);
  assert.equal(secondPayload.appliedEdits, 2);
  assert.equal(firstPayload.diff, secondPayload.diff);
  assert.match(String(firstPayload.diff ?? ""), /- beta/);
  assert.match(String(firstPayload.diff ?? ""), /\+ BETA/);
  assert.match(String(firstPayload.diff ?? ""), /- delta/);
  assert.match(String(firstPayload.diff ?? ""), /\+ DELTA/);
});

test("read_file returns continuation metadata when a limited read truncates the remaining file", async (t) => {
  const root = await createTempWorkspace("read-file-continuation", t);
  await fs.writeFile(
    path.join(root, "big.txt"),
    ["line-1", "line-2", "line-3", "line-4", "line-5"].join("\n"),
    "utf8",
  );

  const registry = createToolRegistry();
  const result = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "big.txt",
      offset: 0,
      limit: 2,
    }),
    makeToolContext(root, root) as never,
  );

  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const continuation = payload.continuation as Record<string, unknown> | undefined;
  assert.match(String(payload.content ?? ""), /line-1/);
  assert.match(String(payload.content ?? ""), /line-2/);
  assert.doesNotMatch(String(payload.content ?? ""), /line-3/);
  assert(continuation);
  assert.equal(continuation.hasMore, true);
  assert.equal(continuation.nextOffset, 2);
  assert.equal(continuation.nextStartLine, 3);
});

test("search_files keeps the base path search flow while adding literal, context, ignoreCase, and limit", async (t) => {
  const root = await createTempWorkspace("search-files-base-flow", t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "one.ts"),
    [
      "const intro = 'alpha';",
      "TODO.literal target",
      "const outro = 'omega';",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "src", "two.ts"),
    [
      "const intro = 'beta';",
      "todo.literal target",
      "const outro = 'omega';",
    ].join("\n"),
    "utf8",
  );

  const registry = createToolRegistry();
  const baseResult = await registry.execute(
    "search_files",
    JSON.stringify({
      path: ".",
      pattern: "alpha",
    }),
    makeToolContext(root, root) as never,
  );
  const enhanced = await registry.execute(
    "search_files",
    JSON.stringify({
      path: ".",
      pattern: "TODO.literal target",
      glob: "src/**/*.ts",
      literal: true,
      ignoreCase: true,
      context: 1,
      limit: 1,
    }),
    makeToolContext(root, root) as never,
  );

  const basePayload = JSON.parse(baseResult.output) as Record<string, unknown>;
  const enhancedPayload = JSON.parse(enhanced.output) as Record<string, unknown>;
  const enhancedMatches = enhancedPayload.matches as Array<Record<string, unknown>>;
  const firstMatch = enhancedMatches[0];

  assert.equal(Array.isArray(basePayload.matches), true);
  assert.equal((basePayload.matches as unknown[]).length, 1);
  assert.equal(enhancedPayload.truncated, true);
  assert.equal(enhancedMatches.length, 1);
  assert.match(String(firstMatch?.path ?? ""), /src[\\/](one|two)\.ts$/);
  assert.deepEqual(firstMatch?.before, ["const intro = 'alpha';"]);
  assert.deepEqual(firstMatch?.after, ["const outro = 'omega';"]);
});

test("list_files compact mode returns a lightweight directory confirmation without changing the tool name", async (t) => {
  const root = await createTempWorkspace("list-files-compact", t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "list_files",
    JSON.stringify({
      path: ".",
      compact: true,
      recursive: true,
      max_entries: 10,
    }),
    makeToolContext(root, root) as never,
  );

  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const entries = payload.entries as Array<Record<string, unknown>>;
  const fileEntry = entries.find((entry) => String(entry.path).endsWith(`src${path.sep}app.ts`) || String(entry.path).endsWith("src/app.ts"));
  assert.equal(payload.compact, true);
  assert(fileEntry);
  assert.equal(Object.hasOwn(fileEntry, "modifiedAt"), false);
  assert.equal(Object.hasOwn(fileEntry, "size"), false);
  assert.equal(Object.hasOwn(fileEntry, "extension"), false);
});

test("system prompt steers path discovery toward find_files instead of shell-first file finding", () => {
  const root = process.cwd();
  const prompt = renderPromptLayers(
    buildSystemPromptLayers(
      root,
      createTestRuntimeConfig(root),
      createProjectContext(root),
    ),
  );

  assert.match(prompt, /find_files/i);
  assert.match(prompt, /shell workaround/i);
});

async function readFileState(
  registry: ReturnType<typeof createToolRegistry>,
  root: string,
  relativePath: string,
): Promise<{
  identity: Record<string, unknown>;
  anchors: Array<Record<string, unknown>>;
}> {
  const result = await registry.execute(
    "read_file",
    JSON.stringify({
      path: relativePath,
    }),
    makeToolContext(root, root) as never,
  );

  const payload = JSON.parse(result.output) as Record<string, unknown>;
  return {
    identity: payload.identity as Record<string, unknown>,
    anchors: payload.anchors as Array<Record<string, unknown>>,
  };
}
