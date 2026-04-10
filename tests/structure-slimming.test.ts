import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function countFileLines(relativePath: string): Promise<number> {
  const source = await fs.readFile(path.join(process.cwd(), relativePath), "utf8");
  return source.split(/\r?\n/).length;
}

test("critical orchestration files stay within the line-count budget after Playwright MCP integration", async () => {
  const checks: Array<[string, number]> = [
    ["src/cli.ts", 490],
    ["src/agent/runTurn.ts", 300],
    ["src/agent/closeout.ts", 220],
    ["src/agent/systemPrompt.ts", 220],
    ["src/agent/promptSections.ts", 120],
    ["src/agent/prompt/static.ts", 220],
    ["src/agent/prompt/dynamic.ts", 300],
    ["src/agent/prompt/format.ts", 80],
    ["src/agent/prompt/metrics.ts", 120],
    ["src/agent/prompt/structured.ts", 120],
    ["src/agent/prompt/types.ts", 40],
    ["src/agent/checkpoint.ts", 80],
    ["src/agent/checkpoint/state.ts", 300],
    ["src/agent/checkpoint/derivation.ts", 260],
    ["src/agent/checkpoint/shared.ts", 220],
    ["src/agent/checkpoint/prompt.ts", 140],
    ["src/agent/runtimeMetrics.ts", 80],
    ["src/agent/runtimeMetrics/state.ts", 260],
    ["src/agent/runtimeMetrics/summary.ts", 220],
    ["src/tools/runtimeRegistry.ts", 120],
    ["src/tools/registry.ts", 160],
    ["src/mcp/playwright/config.ts", 220],
    ["src/skills/discovery.ts", 120],
    ["src/interaction/sessionDriver.ts", 280],
    ["src/interaction/localCommands.ts", 220],
    ["src/interaction/shell.ts", 180],
    ["src/shell/cli/readlineInput.ts", 180],
    ["src/shell/cli/shell.ts", 220],
    ["src/shell/cli/turnDisplay.ts", 220],
    ["src/shell/cli/intro.ts", 180],
    ["src/ui/interactive.ts", 120],
    ["src/ui/localCommands.ts", 40],
    ["src/ui/persistentInput.ts", 40],
    ["src/ui/runtimeSummary.ts", 120],
  ];

  for (const [relativePath, maxLines] of checks) {
    const lineCount = await countFileLines(relativePath);
    assert.equal(
      lineCount <= maxLines,
      true,
      `${relativePath} should stay at or below ${maxLines} lines, got ${lineCount}`,
    );
  }
});
