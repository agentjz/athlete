import { buildFieldBlock, formatLimitedList, type PromptField } from "../../../agent/prompt/structured.js";
import type { AgentWorkingMemory } from "./types.js";

export interface WorkingMemoryPromptOptions {
  currentTitle?: string;
  currentObjectiveLabel?: string;
  memoryTitle?: string;
  includeBoundary?: boolean;
}

export function buildWorkingMemoryPromptBlocks(
  memory: AgentWorkingMemory,
  options: WorkingMemoryPromptOptions = {},
): string[] {
  return [
    buildCurrentWorksetBlock(memory, options),
    buildSessionWorkingMemoryBlock(memory, options),
    options.includeBoundary === false ? undefined : buildHistoryBoundaryBlock(memory),
  ].filter((block): block is string => Boolean(block));
}

export function buildCurrentWorksetBlock(
  memory: AgentWorkingMemory,
  options: WorkingMemoryPromptOptions = {},
): string | undefined {
  const fields: PromptField[] = [];
  if (memory.objective) {
    fields.push({
      label: options.currentObjectiveLabel ?? "User input",
      value: memory.objective,
    });
  }
  const inProgressTodo = memory.todos.find((todo) => todo.status === "in_progress");
  if (inProgressTodo) {
    fields.push({ label: "In progress", value: inProgressTodo.text });
  }
  if (memory.plannedActions.length > 0) {
    fields.push({ label: "Planned actions", value: formatLimitedList(memory.plannedActions, 5) });
  }
  if (memory.activeFiles.length > 0) {
    fields.push({ label: "Active files", value: formatLimitedList(memory.activeFiles, 6) });
  }
  if (memory.blockers.length > 0) {
    fields.push({ label: "Blockers", value: formatLimitedList(memory.blockers, 5) });
  }

  return buildFieldBlock(options.currentTitle ?? "Current workset", fields);
}

export function buildSessionWorkingMemoryBlock(
  memory: AgentWorkingMemory,
  options: WorkingMemoryPromptOptions = {},
): string | undefined {
  const fields: PromptField[] = [];
  if (memory.completedActions.length > 0) {
    fields.push({ label: "Completed", value: formatLimitedList(memory.completedActions, 5) });
  }
  const pendingTodos = memory.todos.filter((todo) => todo.status === "pending");
  if (pendingTodos.length > 0) {
    fields.push({ label: "Pending todos", value: formatLimitedList(pendingTodos.map((todo) => todo.text), 5) });
  }
  if (memory.recentToolBatch) {
    fields.push({
      label: "Recent tool batch",
      value: memory.recentToolBatch.summary || `${memory.recentToolBatch.tools.length} tool(s) recorded`,
    });
  }
  if (memory.recentToolBatch?.changedPaths.length) {
    fields.push({ label: "Changed paths", value: formatLimitedList(memory.recentToolBatch.changedPaths, 5) });
  }
  if (memory.checkpointPhase) {
    fields.push({ label: "Checkpoint", value: `${memory.checkpointStatus ?? "active"} / ${memory.checkpointPhase}` });
  }

  return buildFieldBlock(options.memoryTitle ?? "Session working memory", fields);
}

function buildHistoryBoundaryBlock(memory: AgentWorkingMemory): string | undefined {
  if (!memory.objective) {
    return undefined;
  }

  return buildFieldBlock("History boundary", [
    {
      label: "Policy",
      value: "Raw session history stays in session state; same-session conversation brief and this current-objective working memory are the only automatic continuity surfaces.",
    },
  ]);
}
