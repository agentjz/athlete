import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";

const AGENT_PROFILES = new Set<ExecutionRecord["profile"]>(["subagent", "teammate"]);

export async function summarizeAgentExecutionsForPrompt(
  rootDir: string,
  options: {
    objectiveKey?: string;
  } = {},
): Promise<string> {
  const executions = (await new ExecutionStore(rootDir).listRelevant({
    requestedBy: "lead",
  })).filter((execution) => AGENT_PROFILES.has(execution.profile));
  const relevant = options.objectiveKey
    ? executions.filter((execution) => execution.objectiveKey === options.objectiveKey)
    : executions;

  if (relevant.length === 0) {
    return "No teammates.";
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

  return lines;
}
