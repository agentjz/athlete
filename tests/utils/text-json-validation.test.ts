import assert from "node:assert/strict";
import test from "node:test";

import { stringifyJson, tryParseJson } from "../../src/utils/json.js";
import {
  decodeTextFileEnvelope,
  detectTextCorruption,
  encodeTextFileEnvelope,
  normalizeTextForStorage,
} from "../../src/utils/text.js";
import { classifyValidationCommand } from "../../src/utils/validation.js";

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

test("validation command classifier recognizes common verification commands", () => {
  assert.equal(classifyValidationCommand("npm.cmd test"), "npm-test");
  assert.equal(classifyValidationCommand("npm.cmd run build"), "npm-build");
  assert.equal(classifyValidationCommand("tsc --noEmit ."), "typescript");
  assert.equal(classifyValidationCommand("node --test .test-build/tests/**/*.test.js"), "node-test");
  assert.equal(classifyValidationCommand("npm.cmd run verify"), undefined);
});
