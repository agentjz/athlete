import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getAppPaths } from "../../src/config/paths.js";
import { buildLiveEcologyPrompt } from "./live-ecology/prompt.js";
import { buildToolLedgerPrompt, readToolLedgerReport } from "./live-ecology/toolLedger.js";
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

test("live ecology prompt uses a machine-generated per-tool ledger", () => {
  const prompt = buildToolLedgerPrompt("C:\\repo\\.live-ecology\\files-code", ["read_file", "write_file"]);

  assert.match(prompt, /1\. read_file/);
  assert.match(prompt, /2\. write_file/);
  assert.match(prompt, /live-ecology-tool-report\.json/);
  assert.match(prompt, /Every expected tool must appear exactly once/);
});

test("live ecology ledger report identifies unreported tools", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kitty-live-ledger-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "live-ecology-tool-report.json"),
    `${JSON.stringify({ tools: [{ tool: "read_file", status: "called" }] })}\n`,
    "utf8",
  );

  const report = await readToolLedgerReport(root, ["read_file", "write_file"]);

  assert.deepEqual(report.reportedTools, ["read_file"]);
  assert.deepEqual(report.unreportedTools, ["write_file"]);
});

test("live ecology per-tool prompt targets one machine-scheduled tool", () => {
  const prompt = buildLiveEcologyPrompt(
    {
      id: "files-code",
      title: "file and code tools",
      tools: [
        { name: "read_file", enabled: true },
        { name: "write_file", enabled: true },
      ],
      promptLines: ["Run __RUN_DIR__."],
    },
    "C:\\repo\\.live-ecology\\files-code\\read_file",
    ["read_file", "write_file"],
    { targetTool: "read_file" },
  );

  assert.match(prompt, /must cover exactly this target tool: read_file/);
  assert.match(prompt, /1\. read_file/);
  assert.doesNotMatch(prompt, /2\. write_file/);
});
