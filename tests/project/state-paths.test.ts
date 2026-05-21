import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ensureProjectStateDirectories,
  getProjectStatePaths,
  PROJECT_STATE_DIR_NAME,
} from "../../src/project/statePaths.js";
import { createTempWorkspace } from "../helpers.js";

test("project state paths centralize extension and observability state", async (t) => {
  const root = await createTempWorkspace("project-state", t);
  const paths = getProjectStatePaths(root);

  assert.equal(path.basename(paths.kittyDir), PROJECT_STATE_DIR_NAME);
  assert.equal(paths.extensionsDir.startsWith(paths.kittyDir), true);
  assert.equal(paths.observabilityEventsDir.includes("observability"), true);
  assert.deepEqual(Object.keys(paths).sort(), [
    "extensionsDir",
    "kittyDir",
    "observabilityCrashesDir",
    "observabilityDir",
    "observabilityEventsDir",
    "rootDir",
  ]);

  await ensureProjectStateDirectories(root);
  assert.equal((await fs.stat(paths.extensionsDir)).isDirectory(), true);
  assert.equal((await fs.stat(paths.observabilityEventsDir)).isDirectory(), true);
});
