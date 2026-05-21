import assert from "node:assert/strict";
import test from "node:test";

import { getInitialExtensionSwitches, normalizeExtensions, readEnabledExtensionIds } from "../../src/config/extensions.js";
import { EXTENSION_DEFINITIONS, type ExtensionId } from "../../src/extensions/definitions.js";

test("extension config has one initial switch map", () => {
  const expected = Object.fromEntries(
    EXTENSION_DEFINITIONS.map((definition) => [definition.id, definition.defaultEnabled]),
  );
  assert.deepEqual(getInitialExtensionSwitches(), expected);
});

test("extension config normalizes known extension ids", () => {
  const initialSwitches = getInitialExtensionSwitches();
  const normalized = normalizeExtensions({
    ...initialSwitches,
    todo: false,
    worktree: true,
    unknown: true,
  });
  assert.equal(normalized.todo, false);
  assert.equal(normalized.worktree, true);
  assert.equal("unknown" in normalized, false);

  const expectedEnabled = EXTENSION_DEFINITIONS
    .map((definition) => definition.id)
    .filter((id) => normalized[id as ExtensionId]);
  assert.deepEqual(readEnabledExtensionIds({ extensions: normalized }), expectedEnabled);
});

test("extension config requires every current switch to be explicit", () => {
  assert.throws(
    () => normalizeExtensions({ todo: true }),
    /Missing or invalid extension switch: worktree/,
  );
});
