import assert from "node:assert/strict";
import test from "node:test";

import { stringifyJson, tryParseJson } from "../../src/utils/json.js";
import {
  decodeTextFileEnvelope,
  detectTextCorruption,
  encodeTextFileEnvelope,
  normalizeTextForStorage,
} from "../../src/utils/text.js";

test("text envelopes preserve encoding and line-ending facts", () => {
  const encoded = encodeTextFileEnvelope("alpha\nbeta", {
    encoding: "utf8-bom",
    lineEnding: "\r\n",
  });

  const decoded = decodeTextFileEnvelope(encoded);
  assert.deepEqual(decoded, {
    text: "alpha\nbeta",
    encoding: "utf8-bom",
    lineEnding: "\r\n",
  });
  assert.equal(normalizeTextForStorage("\uFEFFa\r\nb\rc"), "a\nb\nc");
  assert.equal(detectTextCorruption("plain text"), false);
  assert.equal(detectTextCorruption("bad \uFFFD text"), true);
});

test("json helpers parse valid json and preserve invalid text", () => {
  assert.deepEqual(tryParseJson("{\"ok\":true}"), { ok: true });
  assert.equal(tryParseJson("not-json"), "not-json");
  assert.equal(stringifyJson({ ok: true }), "{\n  \"ok\": true\n}\n");
});
