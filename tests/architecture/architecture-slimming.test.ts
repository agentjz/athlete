import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const HOT_PATH_LIMITS = [
  { file: "src/agent/runTurn.ts", maxLines: 420, reason: "lead turn loop should not absorb module details" },
  { file: "src/capabilities/team/messageBus.ts", maxLines: 240, reason: "team message transport should not grow policy logic" },
  { file: "src/utils/commandRunner/platform.ts", maxLines: 320, reason: "platform command handling should stay adapter-sized" },
] as const;

const FORBIDDEN_TYPE_FAMILIES = [
  {
    file: "src/types.ts",
    pattern: /export type RuntimeTransition\s*=/,
    module: "src/types/runtimeTransitions.ts",
  },
  {
    file: "src/types.ts",
    pattern: /export interface AcceptanceContract\b/,
    module: "src/types/acceptance.ts",
  },
] as const;

function countLines(content: string): number {
  return content.split(/\r?\n/).length;
}

test("behavior hot paths stay within emergency slimming guardrails", () => {
  for (const item of HOT_PATH_LIMITS) {
    const fullPath = path.resolve(process.cwd(), item.file);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = countLines(content);
    assert.ok(
      lines <= item.maxLines,
      `${item.file} should stay <= ${item.maxLines} lines, current=${lines}; ${item.reason}`,
    );
  }
});

test("large type families stay in dedicated modules instead of the shared barrel", () => {
  for (const item of FORBIDDEN_TYPE_FAMILIES) {
    const barrelPath = path.resolve(process.cwd(), item.file);
    const modulePath = path.resolve(process.cwd(), item.module);
    const barrel = fs.readFileSync(barrelPath, "utf8");
    assert.equal(fs.existsSync(modulePath), true, `${item.module} should exist`);
    assert.doesNotMatch(barrel, item.pattern, `${item.file} should re-export ${item.module}, not own that type family`);
  }
});

test("runtime transition types live in a dedicated module", () => {
  const transitionsPath = path.resolve(process.cwd(), "src/types/runtimeTransitions.ts");
  assert.equal(fs.existsSync(transitionsPath), true, "src/types/runtimeTransitions.ts should exist");
  const content = fs.readFileSync(transitionsPath, "utf8");
  assert.match(content, /export type RuntimeTransition\s*=/, "RuntimeTransition should be declared in dedicated module");
});

test("concrete capability ecosystems stay under the capability root", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const forbiddenTopLevel = ["skills", "tools", "mcp", "team", "subagent", "workflows"];
  for (const directory of forbiddenTopLevel) {
    assert.equal(
      fs.existsSync(path.join(sourceRoot, directory)),
      false,
      `src/${directory} should live under src/capabilities/${directory}`,
    );
  }

  assert.equal(fs.existsSync(path.join(sourceRoot, "capabilities", "registry.ts")), true);
  assert.equal(fs.existsSync(path.join(sourceRoot, "capabilities", "skills", "packages")), true);
  assert.deepEqual(
    fs.readdirSync(path.join(sourceRoot, "capabilities", "tools")).sort(),
    ["core", "index.ts", "packages"],
  );
});
