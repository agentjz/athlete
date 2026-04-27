import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readFileTool } from "../../src/capabilities/tools/packages/files/readFileTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("read_file decodes UTF-16LE text files with BOM so Unicode stays readable", async (t) => {
  const root = await createTempWorkspace("utf16-read", t);
  const filePath = path.join(root, "notes.txt");
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from("Unicode validation\nsecond line", "utf16le");
  await fs.writeFile(filePath, Buffer.concat([bom, body]));

  const result = await readFileTool.execute(
    JSON.stringify({ path: filePath }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.readable, true);
  assert.match(String(payload.content ?? ""), /Unicode validation/);
  assert.match(String(payload.content ?? ""), /second line/);
  assert.doesNotMatch(String(payload.content ?? ""), /replacement character/);
});

test("read_file preserves UTF-8 mixed content without mojibake markers", async (t) => {
  const root = await createTempWorkspace("utf8-readable", t);
  const filePath = path.join(root, "mixed.txt");
  await fs.writeFile(filePath, "Release notes\nUnicode notes\nEvidence bound\n", "utf8");

  const result = await readFileTool.execute(
    JSON.stringify({ path: filePath }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.readable, true);
  assert.match(String(payload.content ?? ""), /Unicode notes/);
  assert.match(String(payload.content ?? ""), /Evidence bound/);
  assert.doesNotMatch(String(payload.content ?? ""), /mojibake marker/);
});
