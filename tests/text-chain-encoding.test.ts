import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readFileTool } from "../src/tools/files/readFileTool.js";
import { createTempWorkspace, makeToolContext } from "./helpers.js";

test("read_file decodes UTF-16LE text files with BOM so Chinese stays readable", async (t) => {
  const root = await createTempWorkspace("utf16-read", t);
  const filePath = path.join(root, "notes.txt");
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from("中文验证\n第二行", "utf16le");
  await fs.writeFile(filePath, Buffer.concat([bom, body]));

  const result = await readFileTool.execute(
    JSON.stringify({ path: filePath }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.readable, true);
  assert.match(String(payload.content ?? ""), /中文验证/);
  assert.match(String(payload.content ?? ""), /第二行/);
  assert.doesNotMatch(String(payload.content ?? ""), /�/);
});

test("read_file preserves UTF-8 Chinese and English mixed content without mojibake markers", async (t) => {
  const root = await createTempWorkspace("utf8-readable", t);
  const filePath = path.join(root, "mixed.txt");
  await fs.writeFile(filePath, "Release notes\n中文说明\nEvidence bound\n", "utf8");

  const result = await readFileTool.execute(
    JSON.stringify({ path: filePath }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.readable, true);
  assert.match(String(payload.content ?? ""), /中文说明/);
  assert.match(String(payload.content ?? ""), /Evidence bound/);
  assert.doesNotMatch(String(payload.content ?? ""), /鎴|Ã|â|�/);
});

