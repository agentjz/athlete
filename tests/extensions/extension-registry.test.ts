import assert from "node:assert/strict";
import test from "node:test";

import { EXTENSION_IDS, type ExtensionToggleConfig } from "../../src/config/extensions.js";
import { getExtensionDefinition } from "../../src/extensions/definitions.js";
import { createExtensionRegistry } from "../../src/extensions/index.js";
import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext } from "../helpers.js";

test("extension registry is driven by one toggle map", async (t) => {
  const root = await createTempWorkspace("extension-registry", t);
  const config = {
    ...createTestRuntimeConfig(root),
    extensions: Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionToggleConfig,
  };

  const registry = createExtensionRegistry(config);
  const enabled = registry.entries.filter((entry) => entry.enabled).map((entry) => entry.id);
  const names = registry.entries.flatMap((entry) => entry.tools.map((tool) => tool.definition.function.name));

  assert.deepEqual(enabled, EXTENSION_IDS);
  for (const id of EXTENSION_IDS) {
    assert.equal(registry.entries.find((entry) => entry.id === id)?.tools.length, getExtensionDefinition(id).createTools().length);
  }
  for (const name of getExtensionDefinition("spec").createTools().map((tool) => tool.definition.function.name)) {
    assert.equal(names.includes(name), true, `${name} should be registered`);
  }
});

test("disabled extensions are not callable", async (t) => {
  const root = await createTempWorkspace("disabled-extension", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  assert.equal(registry.definitions.some((tool) => tool.function.name === "spec_create"), false);
  await assert.rejects(
    () => registry.execute("spec_create", "{}", context),
    /Unknown tool: spec_create/,
  );
});
