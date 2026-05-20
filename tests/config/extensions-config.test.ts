import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultExtensions, mergeExtensions, normalizeExtensions, readEnabledExtensionIds } from "../../src/config/extensions.js";

test("extension config has one default toggle map", () => {
  assert.deepEqual(getDefaultExtensions(), {
    todo: true,
    worktree: false,
    network: false,
    spec: false,
  });
});

test("extension config normalizes and merges known extension ids", () => {
  const normalized = normalizeExtensions({
    todo: false,
    worktree: true,
    unknown: true,
  });
  assert.deepEqual(normalized, {
    todo: false,
    worktree: true,
    network: false,
    spec: false,
  });

  const merged = mergeExtensions(normalized, { spec: true });
  assert.deepEqual(readEnabledExtensionIds({ extensions: merged }), ["worktree", "spec"]);
});
