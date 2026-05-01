import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildSystemPromptLayers, renderPromptLayers } from "../../src/agent/promptSections.js";
import { orderToolDefinitionsForLead } from "../../src/agent/capabilityPresentation.js";
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

test("turn-time tool presentation ordering reorders tools without reducing the visible tool set", async () => {
  const registry = await createRuntimeToolRegistry(
    createTestRuntimeConfig(process.cwd()),
    {},
    {
      collectMcpSources: async () => [],
      close: async () => undefined,
    },
  );
  const originalNames = registry.definitions.map((tool) => tool.function.name);

  const ordered = orderToolDefinitionsForLead(registry.definitions, {
    input: "Open https://example.com in the browser and inspect the page.",
  });
  const orderedNames = ordered.map((tool) => tool.function.name);

  assert.deepEqual(sortedToolNames(orderedNames), sortedToolNames(originalNames));
  assert.equal(new Set(orderedNames).size, new Set(originalNames).size);
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
      mode: "matches",
      limit: 1,
    }),
    makeToolContext(root, root) as never,
  );

  const basePayload = JSON.parse(baseResult.output) as Record<string, unknown>;
  const enhancedPayload = JSON.parse(enhanced.output) as Record<string, unknown>;
  const enhancedMatches = enhancedPayload.matches as Array<Record<string, unknown>>;
  const firstMatch = enhancedMatches[0];

  assert.equal(basePayload.mode, "files");
  assert.equal(Array.isArray(basePayload.files), true);
  assert.equal((basePayload.files as unknown[]).length, 1);
  assert.equal(basePayload.matchedFilesCount, 1);
  assert.equal(basePayload.totalMatches, 1);
  assert.equal(enhancedPayload.truncated, true);
  assert.equal(enhancedMatches.length, 1);
  assert.match(String(firstMatch?.path ?? ""), /src[\\/](one|two)\.ts$/);
  assert.deepEqual(firstMatch?.before, ["const intro = 'alpha';"]);
  assert.deepEqual(firstMatch?.after, ["const outro = 'omega';"]);
  assert.deepEqual(Object.keys((firstMatch?.readArgs as Record<string, unknown>) ?? {}).sort(), ["end_line", "path", "start_line"]);
});

test("read_file accepts copied paths with surrounding whitespace and quotes", async (t) => {
  const root = await createTempWorkspace("read-file-copied-path", t);
  const filePath = path.join(root, "notes.txt");
  await fs.writeFile(filePath, "alpha\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "read_file",
    JSON.stringify({
      path: `  "${filePath}"  `,
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(payload.path, filePath);
  assert.match(String(payload.content ?? ""), /alpha/);
});

test("search_files files mode returns low-noise file evidence with read continuation args", async (t) => {
  const root = await createTempWorkspace("search-files-files-mode", t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "one.ts"), "alpha\nneedle\nomega\n", "utf8");
  await fs.writeFile(path.join(root, "src", "two.ts"), "needle\nneedle\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "search_files",
    JSON.stringify({
      path: ".",
      pattern: "needle",
      mode: "files",
      limit: 10,
    }),
    makeToolContext(root, root) as never,
  );

  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const files = payload.files as Array<Record<string, unknown>>;

  assert.equal(payload.mode, "files");
  assert.equal(payload.matchedFilesCount, 2);
  assert.equal(payload.totalMatches, 3);
  assert.equal(Array.isArray(payload.matches), false);
  assert.equal(files.length, 2);
  assert(files.every((file) => typeof file.path === "string"));
  assert(files.every((file) => typeof file.matches === "number"));
  assert(files.every((file) => typeof file.firstLine === "number"));
  assert(files.every((file) => typeof file.readArgs === "object" && file.readArgs !== null));
});

test("search_files count mode returns distribution evidence without match content", async (t) => {
  const root = await createTempWorkspace("search-files-count-mode", t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "one.ts"), "needle\n", "utf8");
  await fs.writeFile(path.join(root, "src", "two.ts"), "needle\nneedle\n", "utf8");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "search_files",
    JSON.stringify({
      path: ".",
      pattern: "needle",
      mode: "count",
      limit: 10,
    }),
    makeToolContext(root, root) as never,
  );

  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const files = payload.files as Array<Record<string, unknown>>;

  assert.equal(payload.mode, "count");
  assert.equal(payload.matchedFilesCount, 2);
  assert.equal(payload.totalMatches, 3);
  assert.equal(Array.isArray(payload.matches), false);
  assert.equal(files.length, 2);
  assert(files.every((file) => typeof file.path === "string"));
  assert(files.every((file) => typeof file.matches === "number"));
  assert(files.every((file) => Object.hasOwn(file, "readArgs") === false));
  assert(files.every((file) => Object.hasOwn(file, "firstLine") === false));
});

test("code fact tools expose symbols, references, and structural patterns as read-only evidence", async (t) => {
  const root = await createTempWorkspace("code-facts", t);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "service.ts"),
    [
      "export interface ServiceConfig {",
      "  endpoint: string;",
      "}",
      "",
      "export class ServiceClient {",
      "  constructor(private config: ServiceConfig) {}",
      "  async fetchUser(id: string) {",
      "    return this.config.endpoint + id;",
      "  }",
      "}",
      "",
      "export function createService(config: ServiceConfig) {",
      "  return new ServiceClient(config);",
      "}",
    ].join("\n"),
    "utf8",
  );

  const registry = createToolRegistry();
  const symbolEntry = registry.entries?.find((entry) => entry.name === "code_symbols");
  const referencesEntry = registry.entries?.find((entry) => entry.name === "code_references");
  const patternEntry = registry.entries?.find((entry) => entry.name === "code_pattern");
  assert.equal(symbolEntry?.governance.mutation, "read");
  assert.equal(referencesEntry?.governance.specialty, "code");
  assert.equal(patternEntry?.governance.concurrencySafe, true);

  const symbolsResult = await registry.execute(
    "code_symbols",
    JSON.stringify({
      path: ".",
      query: "Service",
      literal: true,
      limit: 20,
    }),
    makeToolContext(root, root) as never,
  );
  const referencesResult = await registry.execute(
    "code_references",
    JSON.stringify({
      path: ".",
      symbol: "ServiceConfig",
      limit: 20,
    }),
    makeToolContext(root, root) as never,
  );
  const patternResult = await registry.execute(
    "code_pattern",
    JSON.stringify({
      path: ".",
      pattern: "async\\s+fetchUser",
      limit: 20,
    }),
    makeToolContext(root, root) as never,
  );

  const symbolsPayload = JSON.parse(symbolsResult.output) as Record<string, unknown>;
  const referencesPayload = JSON.parse(referencesResult.output) as Record<string, unknown>;
  const patternPayload = JSON.parse(patternResult.output) as Record<string, unknown>;
  const symbols = symbolsPayload.symbols as Array<Record<string, unknown>>;
  const references = referencesPayload.references as Array<Record<string, unknown>>;
  const matches = patternPayload.matches as Array<Record<string, unknown>>;

  assert.equal(symbolsPayload.totalReturned, 3);
  assert(symbols.some((symbol) => symbol.kind === "interface" && symbol.name === "ServiceConfig"));
  assert(symbols.some((symbol) => symbol.kind === "class" && symbol.name === "ServiceClient"));
  assert(symbols.every((symbol) => typeof symbol.readArgs === "object" && symbol.readArgs !== null));
  assert.equal(referencesPayload.symbol, "ServiceConfig");
  assert.equal(references.length >= 3, true);
  assert(references.every((reference) => typeof reference.readArgs === "object" && reference.readArgs !== null));
  assert.equal(matches.length, 1);
  assert.match(String(matches[0]?.text ?? ""), /fetchUser/);
  assert.deepEqual(Object.keys((matches[0]?.readArgs as Record<string, unknown>) ?? {}).sort(), ["end_line", "path", "start_line"]);
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
