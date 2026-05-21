import assert from "node:assert/strict";
import test from "node:test";

import { loadSpecRuntime, createSpecBuiltinToolFilter } from "../../src/spec/runtime.js";
import { SpecStore } from "../../src/spec/store.js";
import { getBuiltinTools } from "../../src/tools/toolCatalog.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

const PROJECT_DOC_MAX_BYTES = 24 * 1024;

test("spec runtime exposes spec prompt, tools, and isolated workspace", async (t) => {
  const root = await createTempWorkspace("spec-runtime", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({
    title: "Workflow Feature",
    sessionId: "session-1",
  });

  const runtime = await loadSpecRuntime({
    cwd: root,
    sessionId: "session-1",
    projectDocMaxBytes: PROJECT_DOC_MAX_BYTES,
  });
  const toolNames = runtime.tools.map((tool) => tool.definition.function.name);

  assert.equal(runtime.activeSpec?.id, spec.id);
  assert.equal(runtime.cwd, spec.workspace?.path);
  assert.deepEqual(readBuiltinToolNames(runtime.builtinToolFilter), ["read", "bash"]);
  assert.match(runtime.promptBlock, /Kitty spec mode/);
  assert.match(runtime.promptBlock, /requirements clarification -> requirements -> design -> tasks -> implement -> validate -> archive/);
  assert.match(runtime.promptBlock, /preserve interview evidence in notes\.md/);
  assert.match(runtime.promptBlock, /short or referential/);
  assert.match(runtime.promptBlock, /recent conversation text/);
  assert.match(runtime.promptBlock, /Clean up conflicting or stale notes before writing design\.md or tasks\.md/);
  assert.match(runtime.promptBlock, /confirmed implementation work expands the writable code tool surface/);
  assert.equal(toolNames.includes("spec_create"), true);
  assert.equal(toolNames.includes("spec_checkpoint_restore"), true);
});

test("spec runtime tells new feature sessions to create a spec and persist notes", async (t) => {
  const root = await createTempWorkspace("spec-runtime-empty", t);
  await initGitRepo(root);

  const runtime = await loadSpecRuntime({
    cwd: root,
    sessionId: "session-without-spec",
    projectDocMaxBytes: PROJECT_DOC_MAX_BYTES,
  });

  assert.equal(runtime.activeSpec, null);
  assert.deepEqual(readBuiltinToolNames(runtime.builtinToolFilter), ["read", "bash"]);
  assert.match(runtime.promptBlock, /Active spec: none bound to this session/);
  assert.match(runtime.promptBlock, /call spec_create first/);
  assert.match(runtime.promptBlock, /notes\.md/);
});

test("spec builtin tool surface expands only for confirmed implementation work", async (t) => {
  const root = await createTempWorkspace("spec-runtime-stage-tools", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({
    title: "Confirmed Implementation",
    sessionId: "session-implementation",
  });

  assert.deepEqual(readBuiltinToolNames(createSpecBuiltinToolFilter(spec)), ["read", "bash"]);

  const ready = await store.updateState(spec.id, {
    stage: "implement",
    confirmed: {
      requirements: true,
      design: true,
      tasks: true,
    },
  });
  const runtime = await loadSpecRuntime({
    cwd: root,
    sessionId: "session-implementation",
    projectDocMaxBytes: PROJECT_DOC_MAX_BYTES,
  });

  assert.deepEqual(readBuiltinToolNames(createSpecBuiltinToolFilter(ready)), ["read", "write", "edit", "bash"]);
  assert.deepEqual(readBuiltinToolNames(runtime.builtinToolFilter), ["read", "write", "edit", "bash"]);
});

function readBuiltinToolNames(filter: (tool: ReturnType<typeof getBuiltinTools>[number]) => boolean): string[] {
  return getBuiltinTools()
    .filter(filter)
    .map((tool) => tool.definition.function.name);
}
