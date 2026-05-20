import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("spec extension manages one spec document with state and checkpoints", async (t) => {
  const root = await createTempWorkspace("spec-extension", t);
  const context = createToolContext(root);
  context.config.extensions.spec = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const created = await registry.execute("spec_create", JSON.stringify({
    title: "扩展工具重建",
    requirements: "扩展是工具集合，不是运行模式。",
    design: "集中注册，目录内部按工具拆分。",
    tasks: "- [ ] 写测试\n- [ ] 写实现",
  }), context);
  assert.equal(created.ok, true);
  const createdPayload = parseToolJson(created.output);
  const specPath = String(createdPayload.documentPath);
  assert.match(await fs.readFile(specPath, "utf8"), /## Requirements/);

  const note = await registry.execute("spec_append_note", JSON.stringify({
    text: "测试先于实现。",
  }), context);
  assert.equal(note.ok, true);

  const task = await registry.execute("spec_task_update", JSON.stringify({
    task_id: "task-1",
    text: "写测试",
    status: "completed",
  }), context);
  assert.equal(task.ok, true);

  const checkpoint = await registry.execute("spec_checkpoint_create", JSON.stringify({
    label: "tests-written",
  }), context);
  assert.equal(checkpoint.ok, true);

  const checkpoints = await registry.execute("spec_checkpoint_list", "{}", context);
  assert.equal(checkpoints.ok, true);
  assert.equal((parseToolJson(checkpoints.output).checkpoints as unknown[]).length, 1);

  const opened = await registry.execute("spec_open", "{}", context);
  assert.equal(opened.ok, true);
  assert.equal((parseToolJson(opened.output).state as Record<string, unknown>).title, "扩展工具重建");
});
