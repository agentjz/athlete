import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentWorkingMemory } from "../../src/context/runtime/workingMemory/build.js";
import { buildWorkingMemoryPromptBlocks } from "../../src/context/runtime/workingMemory/prompt.js";
import { createToolMessage } from "../../src/session/messages.js";
import { prepareSessionRecordForSave } from "../../src/session/snapshot.js";
import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("todo extension writes session todo facts for working memory", async (t) => {
  const root = await createTempWorkspace("todo-extension", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);
  assert.deepEqual(
    (registry.entries ?? [])
      .filter((entry) => entry.origin.sourceId === "extension:todo")
      .map((entry) => entry.name),
    ["todo_write"],
  );

  const written = await registry.execute("todo_write", JSON.stringify({
    items: [
      { id: "1", text: "research current todo design", status: "completed" },
      { id: "2", text: "restore session todo facts", status: "in_progress" },
      { id: "3", text: "run focused tests", status: "pending" },
    ],
  }), context);
  assert.equal(written.ok, true);

  const writePayload = parseToolJson(written.output);
  assert.equal(writePayload.total, 3);
  assert.equal(writePayload.completed, 1);
  assert.equal(writePayload.inProgress, "2");
  assert.match(String(writePayload.preview), /\[>\] #2: restore session todo facts/);

  const persisted = prepareSessionRecordForSave({
    id: "session-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    cwd: root,
    messageCount: 0,
    messages: [
      createToolMessage("call-1", written.output, "todo_write"),
    ],
  });
  assert.deepEqual(persisted.todoItems, writePayload.items);

  const memory = buildAgentWorkingMemory({
    todoItems: persisted.todoItems,
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(memory.todos.length, 3);
  assert.equal(memory.todos.find((item) => item.status === "in_progress")?.text, "restore session todo facts");
  assert.match(buildWorkingMemoryPromptBlocks(memory).join("\n"), /Pending todos/);
});
