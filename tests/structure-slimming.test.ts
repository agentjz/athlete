import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("state-core files enforce single responsibility instead of numeric line budgets", async () => {
  const sessionStoreSource = await readSource("src/agent/session/store.ts");
  const sessionSnapshotSource = await readSource("src/agent/session/snapshot.ts");
  const configStoreSource = await readSource("src/config/store.ts");
  const configRuntimeSource = await readSource("src/config/runtime.ts");
  const configFileStoreSource = await readSource("src/config/fileStore.ts");
  const hostSessionSource = await readSource("src/host/session.ts");

  assert.doesNotMatch(sessionStoreSource, /JSON\.parse\(/);
  assert.doesNotMatch(sessionStoreSource, /deriveAcceptanceState\(/);
  assert.doesNotMatch(sessionStoreSource, /normalizeSessionCheckpoint\(/);
  assert.match(sessionStoreSource, /parseSessionSnapshot/);
  assert.match(sessionStoreSource, /serializeSessionSnapshot/);

  assert.match(sessionSnapshotSource, /export function parseSessionSnapshot/);
  assert.match(sessionSnapshotSource, /export function prepareSessionRecordForSave/);
  assert.match(sessionSnapshotSource, /CURRENT_SESSION_SCHEMA_VERSION/);

  assert.doesNotMatch(configStoreSource, /process\.env\./);
  assert.doesNotMatch(configStoreSource, /loadDotEnvFiles/);
  assert.match(configStoreSource, /from "\.\/fileStore\.js"/);
  assert.match(configStoreSource, /from "\.\/runtime\.js"/);

  assert.match(configRuntimeSource, /loadDotEnvFiles/);
  assert.match(configRuntimeSource, /process\.env\./);
  assert.doesNotMatch(configFileStoreSource, /process\.env\./);

  assert.match(hostSessionSource, /isSessionNotFoundError/);
  assert.doesNotMatch(hostSessionSource, /catch\s*\{\s*$/m);
});
