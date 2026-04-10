import { getBrowserStepRank, isBrowserGovernedTool } from "./governance.js";
import type { ToolRegistryEntry } from "./types.js";

export function sortToolRegistryEntriesForExposure(entries: readonly ToolRegistryEntry[]): ToolRegistryEntry[] {
  return [...entries]
    .map((tool, index) => ({
      tool,
      index,
      rank: getExposureRank(tool),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.tool);
}

function getExposureRank(entry: ToolRegistryEntry): number {
  if (isBrowserGovernedTool(entry.governance)) {
    return getBrowserStepRank(entry.governance);
  }

  if (entry.governance.specialty === "document" && entry.governance.mutation === "read") {
    return 20;
  }

  if (entry.governance.source === "mcp") {
    return 30;
  }

  if (entry.governance.specialty === "filesystem" && entry.governance.mutation === "read") {
    return 40;
  }

  if (entry.governance.specialty === "shell" || entry.governance.specialty === "background") {
    return 100;
  }

  return 50;
}
