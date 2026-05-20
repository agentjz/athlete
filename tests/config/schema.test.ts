import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultConfig, normalizeConfig } from "../../src/config/schema.js";

test("config schema normalizes model, context, telegram, and extensions", () => {
  const config = getDefaultConfig();
  const normalized = normalizeConfig({
    ...config,
    provider: "",
    model: "",
    contextWindowMessages: 1,
    maxContextChars: 1,
    contextSummaryChars: 1,
    maxReadBytes: 1,
    commandStallTimeoutMs: 1,
    extensions: {
      ...config.extensions,
      network: true,
    },
  });

  assert.equal(normalized.provider, "deepseek");
  assert.equal(normalized.model, "deepseek-v4-flash");
  assert.equal(normalized.contextWindowMessages, 6);
  assert.equal(normalized.maxContextChars, 8_000);
  assert.equal(config.contextWindowMessages, 120);
  assert.equal(config.maxContextChars, 900_000);
  assert.equal(config.contextSummaryChars, 120_000);
  assert.equal(config.maxOutputTokens, 384_000);
  assert.equal(normalized.extensions.network, true);
});
