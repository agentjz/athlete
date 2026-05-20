import assert from "node:assert/strict";
import test from "node:test";

import { computeRecoveryDelayMs, isRecoverableTurnError } from "../../src/provider/retryPolicy.js";

test("provider retry policy recognizes transient failures", () => {
  assert.equal(isRecoverableTurnError({ code: "ECONNRESET" }), true);
  assert.equal(isRecoverableTurnError(new Error("connection refused")), true);
  assert.equal(isRecoverableTurnError(new Error("invalid request")), false);
});

test("provider retry delay is bounded exponential backoff", () => {
  assert.equal(computeRecoveryDelayMs(1), 1_000);
  assert.equal(computeRecoveryDelayMs(3), 4_000);
  assert.equal(computeRecoveryDelayMs(20), 30_000);
});
