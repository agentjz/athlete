import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { extractCloseoutSessionId, getLiveTaskSessionsDir } from "./live-ecology/sessionCapture.js";

test("live ecology extracts session id from one-shot closeout JSON", () => {
  const output = [
    "[tool] read_file package.json:1-20",
    JSON.stringify({
      sessionId: "20260502031600-23deae54",
      completed: true,
    }),
    "",
  ].join("\n");

  assert.equal(extractCloseoutSessionId(output), "20260502031600-23deae54");
});

test("live ecology session monitor uses the same runtime session directory as Kitty", () => {
  const root = process.cwd();
  assert.equal(getLiveTaskSessionsDir(root), path.join(getAppPaths(root).dataDir, "sessions"));
  assert.match(getLiveTaskSessionsDir(root), /[\\/]\\.kitty[\\/]sessions$/);
});
