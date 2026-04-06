import type { RegisteredTool } from "./types.js";

const SHELL_LIKE_TOOLS = new Set(["run_shell", "background_run"]);

export function sortRegisteredToolsForExposure(tools: readonly RegisteredTool[]): RegisteredTool[] {
  return [...tools]
    .map((tool, index) => ({
      tool,
      index,
      rank: getExposureRank(tool.definition.function.name),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.tool);
}

function getExposureRank(name: string): number {
  if (/^mcp_playwright_browser_/i.test(name)) {
    return 0;
  }

  if (/^mcp_/i.test(name)) {
    return 10;
  }

  if (SHELL_LIKE_TOOLS.has(name)) {
    return 100;
  }

  return 50;
}
