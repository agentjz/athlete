import assert from "node:assert/strict";
import test from "node:test";

import { getInitialRuntimeConfig } from "../../src/config/initialConfig.js";
import { getDefaultProviderPreset } from "../../src/config/providerPresets.js";
import { normalizeRuntimeConfig } from "../../src/config/schema.js";

test("runtime config schema normalizes model, context, telegram, and extensions", () => {
  const defaultPreset = getDefaultProviderPreset();
  const config = getInitialRuntimeConfig();
  const normalized = normalizeRuntimeConfig({
    ...config,
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

  assert.equal(normalized.provider, defaultPreset.provider);
  assert.equal(normalized.model, defaultPreset.model);
  assert.equal(config.provider, defaultPreset.provider);
  assert.equal(config.baseUrl, defaultPreset.baseUrl);
  assert.equal(config.model, defaultPreset.model);
  assert.equal(config.thinking, defaultPreset.thinking);
  assert.equal(config.reasoningEffort, defaultPreset.reasoningEffort);
  assert.equal(normalized.contextWindowMessages, 6);
  assert.equal(normalized.maxContextChars, 8_000);
  assert.equal(config.contextWindowMessages, 120);
  assert.equal(config.maxContextChars, 900_000);
  assert.equal(config.contextSummaryChars, 120_000);
  assert.equal(config.maxOutputTokens, 384_000);
  assert.equal(normalized.extensions.network, true);
});

test("runtime config schema rejects missing required values instead of hiding defaults", () => {
  const config = getInitialRuntimeConfig();
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, provider: "" }),
    /Missing config value: provider/,
  );
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, telegram: { ...config.telegram, apiBaseUrl: "" } }),
    /Missing Telegram API base URL/,
  );
  assert.throws(
    () => normalizeRuntimeConfig({ ...config, extensions: { ...config.extensions, spec: undefined as unknown as boolean } }),
    /Missing or invalid extension switch: spec/,
  );
});
