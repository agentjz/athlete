import assert from "node:assert/strict";
import test from "node:test";

import { colorizeTodoMarkers } from "../src/ui/todoStyling.js";

test("colorizeTodoMarkers preserves todo text content", () => {
  const input = [
    "[ ] #1: pending task",
    "[>] #2: in progress task",
    "[x] #3: completed task",
    "- Progress: 1/3 completed",
  ].join("\n");

  const styled = colorizeTodoMarkers(input);
  assert.equal(stripAnsi(styled), input);
});

test("colorizeTodoMarkers keeps non-todo lines unchanged", () => {
  const input = "plain status line";
  assert.equal(colorizeTodoMarkers(input), input);
});

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
