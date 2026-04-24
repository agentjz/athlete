import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubagentBudget } from "../src/subagent/budget.js";
import { createSubagentBudgetExceededReason } from "../src/subagent/budget.js";
import { createSubagentBudgetTracker } from "../src/subagent/budget.js";
import { SubagentBudgetExceededError } from "../src/subagent/errors.js";

test("mode budgets map to fast/balanced/deep defaults", () => {
  const fast = resolveSubagentBudget("fast");
  const balanced = resolveSubagentBudget("balanced");
  const deep = resolveSubagentBudget("deep");

  assert.deepEqual(fast, {
    maxToolCalls: 4,
    maxModelTurns: 3,
    maxElapsedMs: 120_000,
  });
  assert.deepEqual(balanced, {
    maxToolCalls: 10,
    maxModelTurns: 8,
    maxElapsedMs: 360_000,
  });
  assert.deepEqual(deep, {
    maxToolCalls: 20,
    maxModelTurns: 16,
    maxElapsedMs: 900_000,
  });
});

test("F04/F06: budget tracker stops subagent on tool-call or model-turn limit", () => {
  const tracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 2,
      maxModelTurns: 2,
      maxElapsedMs: 5_000,
    },
    () => 1_000,
  );

  tracker.noteModelTurn();
  tracker.noteToolCall("read_file");
  tracker.noteToolCall("search_files");
  const toolExceeded = tracker.noteToolCall("run_shell");
  assert.equal(toolExceeded?.dimension, "tool_calls");

  const anotherTracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 5,
      maxModelTurns: 1,
      maxElapsedMs: 5_000,
    },
    () => 2_000,
  );
  anotherTracker.noteModelTurn();
  const turnExceeded = anotherTracker.noteModelTurn();
  assert.equal(turnExceeded?.dimension, "model_turns");
});

test("F05: budget tracker stops subagent on elapsed wall-clock limit", () => {
  let now = 10_000;
  const tracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 10,
      maxModelTurns: 10,
      maxElapsedMs: 1_000,
    },
    () => now,
  );

  now = 11_500;
  const elapsedExceeded = tracker.evaluate();
  assert.equal(elapsedExceeded?.dimension, "elapsed_ms");
});

test("budget exceeded error is structured and machine-readable", () => {
  const reason = createSubagentBudgetExceededReason(
    "tool_calls",
    {
      toolCalls: 3,
      modelTurns: 1,
      elapsedMs: 900,
      maxToolCalls: 2,
      maxModelTurns: 8,
      maxElapsedMs: 360_000,
    },
  );

  const error = new SubagentBudgetExceededError(reason);
  assert.equal(error.reason.code, "subagent_budget_exhausted");
  assert.equal(error.reason.dimension, "tool_calls");
  assert.match(error.message, /budget/i);
});
