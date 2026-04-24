import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const FILE_SIZE_LIMITS = [
  { file: "src/agent/runTurn.ts", maxLines: 360 },
  { file: "src/orchestrator/taskLifecycle.ts", maxLines: 260 },
  { file: "src/orchestrator/dispatch.ts", maxLines: 260 },
  { file: "src/execution/worker.ts", maxLines: 220 },
  { file: "src/team/messageBus.ts", maxLines: 180 },
  { file: "src/utils/commandRunner/platform.ts", maxLines: 260 },
  { file: "src/types.ts", maxLines: 520 },
] as const;

function countLines(content: string): number {
  return content.split(/\r?\n/).length;
}

test("core files stay under the slimming guardrails", () => {
  for (const item of FILE_SIZE_LIMITS) {
    const fullPath = path.resolve(process.cwd(), item.file);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = countLines(content);
    assert.ok(
      lines <= item.maxLines,
      `${item.file} should stay <= ${item.maxLines} lines, current=${lines}`,
    );
  }
});

test("runtime transition types live in a dedicated module", () => {
  const transitionsPath = path.resolve(process.cwd(), "src/types/runtimeTransitions.ts");
  assert.equal(fs.existsSync(transitionsPath), true, "src/types/runtimeTransitions.ts should exist");
  const content = fs.readFileSync(transitionsPath, "utf8");
  assert.match(content, /export type RuntimeTransition\s*=/, "RuntimeTransition should be declared in dedicated module");
});
