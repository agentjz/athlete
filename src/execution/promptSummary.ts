import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";

const AGENT_PROFILES = new Set<ExecutionRecord["profile"]>(["subagent", "teammate"]);

export async function summarizeAgentExecutionsForPrompt(
  rootDir: string,
  options: {
    objectiveKey?: string;
    includeCarryoverCount?: boolean;
  } = {},
): Promise<string> {
  const executions = (await new ExecutionStore(rootDir).listRelevant({
    requestedBy: "lead",
  })).filter((execution) => AGENT_PROFILES.has(execution.profile));
  const relevant = options.objectiveKey
    ? executions.filter((execution) => execution.objectiveKey === options.objectiveKey)
    : executions;

  if (relevant.length === 0) {
    const carryoverCount = countCarryover(executions, options.objectiveKey);
    return carryoverCount > 0 && options.includeCarryoverCount
      ? `No current objective agent executions. Carryover agent executions hidden: ${carryoverCount}.`
      : "No teammates.";
  }

  const lines = relevant
    .slice(0, 8)
    .map((execution) => {
      const marker = execution.status === "completed"
        ? "[x]"
        : execution.status === "failed" || execution.status === "aborted"
          ? "[!]"
          : "[>]";
      return `${marker} ${execution.profile} ${execution.id} ${execution.actorName}: ${execution.status}`;
    })
    .join("\n");

  const carryoverCount = countCarryover(executions, options.objectiveKey);
  return carryoverCount > 0 && options.includeCarryoverCount
    ? `${lines}\n- Carryover agent executions hidden: ${carryoverCount}`
    : lines;
}

function countCarryover(executions: ExecutionRecord[], objectiveKey: string | undefined): number {
  if (!objectiveKey) {
    return 0;
  }

  return executions.filter((execution) => execution.objectiveKey !== objectiveKey).length;
}
