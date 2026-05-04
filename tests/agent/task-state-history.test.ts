import assert from "node:assert/strict";
import test from "node:test";

import { collectCompletedActions } from "../../src/agent/session/taskStateHistory.js";
import type { StoredMessage } from "../../src/types.js";

function toolMessage(name: string, payload: Record<string, unknown>): StoredMessage {
  return {
    role: "tool",
    tool_call_id: `call-${name}`,
    name,
    content: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  };
}

test("completed action summaries use the four-tool vocabulary", () => {
  const actions = collectCompletedActions([
    toolMessage("bash", {
      command: "rg needle src",
      exitCode: 0,
    }),
    toolMessage("read", {
      path: "src/a.ts",
    }),
    toolMessage("edit", {
      path: "src/a.ts",
    }),
    toolMessage("write", {
      path: "new.txt",
    }),
  ]);

  assert.deepEqual(actions, [
    "bash rg needle src (exit 0)",
    "read src/a.ts",
    "edit src/a.ts",
    "write new.txt",
  ]);
});
