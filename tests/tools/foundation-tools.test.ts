import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext, parseToolJson } from "../helpers.js";

test("agent registry exposes the four foundation tools", async (t) => {
  const root = await createTempWorkspace("foundation-tools", t);
  const registry = await createDefaultAgentToolRegistry(createTestRuntimeConfig(root));
  const names = registry.definitions.map((tool) => tool.function.name);

  for (const name of ["read", "edit", "write", "bash"]) {
    assert.equal(names.includes(name), true);
  }
});

test("read write edit bash complete the coding loop", async (t) => {
  const root = await createTempWorkspace("foundation-loop", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const write = await registry.execute("write", JSON.stringify({
    path: "src/message.txt",
    content: "alpha\nbeta\n",
    create_directories: true,
  }), context);
  assert.equal(write.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\nbeta\n");

  const read = await registry.execute("read", JSON.stringify({
    path: "src/message.txt",
    offset: 1,
    limit: 2,
  }), context);
  assert.equal(read.ok, true);
  assert.match(String(parseToolJson(read.output).content), /alpha/);

  const edit = await registry.execute("edit", JSON.stringify({
    path: "src/message.txt",
    edits: [{ oldText: "beta", newText: "gamma" }],
  }), context);
  assert.equal(edit.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\ngamma\n");

  const bash = await registry.execute("bash", JSON.stringify({
    command: "node -e \"const fs=require('fs'); process.stdout.write(fs.readFileSync('src/message.txt','utf8'))\"",
    cwd: ".",
    timeout_ms: 30_000,
  }), context);
  assert.equal(bash.ok, true);
  assert.equal(parseToolJson(bash.output).exitCode, 0);
});
