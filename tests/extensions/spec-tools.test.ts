import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, createToolContext, initGitRepo, parseToolJson } from "../helpers.js";

test("spec extension persists durable documents, state, tasks, notes, and checkpoints", async (t) => {
  const root = await createTempWorkspace("spec-extension", t);
  await initGitRepo(root);
  const context = createToolContext(root);
  context.config.extensions.spec = true;
  const registry = await createDefaultAgentToolRegistry(context.config);
  const appendNoteDefinition = registry.definitions.find((tool) => tool.function.name === "spec_append_note");
  assert.match(appendNoteDefinition?.function.description ?? "", /user wording/);
  assert.match(appendNoteDefinition?.function.description ?? "", /confirmed facts/);
  assert.match(appendNoteDefinition?.function.description ?? "", /model proposals/);

  const created = await registry.execute("spec_create", JSON.stringify({
    title: "扩展工具重建",
    summary: "Spec 是可插拔扩展能力。",
  }), context);
  assert.equal(created.ok, true);
  const createdPayload = parseToolJson(created.output);
  const specId = (createdPayload.spec as Record<string, unknown>).id as string;
  const workspacePath = (createdPayload.workspace as Record<string, unknown>).path as string;

  const requirements = "# Requirements\n\n- 扩展是工具集合，不是运行模式。\n";
  const written = await registry.execute("spec_write_document", JSON.stringify({
    specId,
    document: "requirements",
    content: requirements,
  }), context);
  assert.equal(written.ok, true);

  const note = await registry.execute("spec_append_note", JSON.stringify({
    specId,
    heading: "用户确认",
    content: "用户确认 spec 需要恢复为完整多文档能力。",
  }), context);
  assert.equal(note.ok, true);

  const state = await registry.execute("spec_update_state", JSON.stringify({
    specId,
    stage: "design",
    requirementsConfirmed: true,
  }), context);
  assert.equal(state.ok, true);
  assert.equal((parseToolJson(state.output).confirmed as Record<string, unknown>).requirements, true);

  const task = await registry.execute("spec_task_update", JSON.stringify({
    specId,
    taskId: "T001",
    title: "恢复 spec store",
    status: "completed",
    evidence: "requirements.md written",
  }), context);
  assert.equal(task.ok, true);
  assert.equal((parseToolJson(task.output).task as Record<string, unknown>).status, "completed");

  await fs.writeFile(path.join(workspacePath, "feature.txt"), "before\n", "utf8");
  const checkpoint = await registry.execute("spec_checkpoint_create", JSON.stringify({
    specId,
    label: "requirements confirmed",
  }), context);
  assert.equal(checkpoint.ok, true);
  const checkpointId = (parseToolJson(checkpoint.output).checkpoint as Record<string, unknown>).id as string;

  const store = new SpecStore(root, { rootDir: root });
  assert.equal(await store.readDocument(specId, "requirements"), requirements);
  assert.match(await store.readDocument(specId, "notes"), /完整多文档能力/);
  assert.equal((await store.load(specId)).tasks.T001?.status, "completed");

  await registry.execute("spec_write_document", JSON.stringify({
    specId,
    document: "requirements",
    content: "# Requirements\n\nafter\n",
  }), context);
  await fs.writeFile(path.join(workspacePath, "feature.txt"), "after\n", "utf8");
  await registry.execute("spec_checkpoint_create", JSON.stringify({
    specId,
    label: "after change",
  }), context);

  const restored = await registry.execute("spec_checkpoint_restore", JSON.stringify({
    specId,
    checkpointId,
  }), context);
  assert.equal(restored.ok, true);
  assert.equal(await store.readDocument(specId, "requirements"), requirements);
  assert.equal(normalizeNewlines(await fs.readFile(path.join(workspacePath, "feature.txt"), "utf8")), "before\n");
});

test("spec extension lists, searches, opens, and reads durable specs by explicit id", async (t) => {
  const root = await createTempWorkspace("spec-extension-discovery", t);
  await initGitRepo(root);
  const context = createToolContext(root);
  context.config.extensions.spec = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const created = parseToolJson((await registry.execute("spec_create", JSON.stringify({
    title: "Browser Control Console",
  }), context)).output);
  const specId = (created.spec as Record<string, unknown>).id as string;
  await registry.execute("spec_write_document", JSON.stringify({
    specId,
    document: "design",
    content: "# Design\n\nLocal developer browser console with unique-token: browser-control-console.\n",
  }), context);

  const listed = parseToolJson((await registry.execute("spec_list", JSON.stringify({ limit: 10 }), context)).output);
  assert.equal((listed.specs as Array<Record<string, unknown>>).some((item) => item.id === specId), true);

  const searched = parseToolJson((await registry.execute("spec_search", JSON.stringify({
    query: "browser-control-console",
  }), context)).output);
  assert.equal((searched.specs as Array<Record<string, unknown>>)[0]?.id, specId);

  const opened = parseToolJson((await registry.execute("spec_open", JSON.stringify({ specId }), context)).output);
  assert.equal((opened.spec as Record<string, unknown>).id, specId);
  const openedDesign = (opened.documents as Record<string, string>).design;
  assert.equal(typeof openedDesign, "string");
  assert.match(openedDesign as string, /browser-control-console/);

  const read = parseToolJson((await registry.execute("spec_read_document", JSON.stringify({
    specId,
    document: "design",
  }), context)).output);
  assert.equal(typeof read.content, "string");
  assert.match(read.content as string, /Local developer browser console/);
});

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
