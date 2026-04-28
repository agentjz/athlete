import type { SessionRecord, StoredMessage, TaskState } from "../../types.js";
import { collectActiveFiles, collectBlockers, collectCompletedActions, collectPlannedActions, truncate } from "./taskStateHistory.js";
import { createInternalReminder, isInternalMessage, oneLine, readUserInput } from "./turnFrame.js";

const MAX_ACTIVE_FILES = 12;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 12;
const MAX_BLOCKERS = 8;

export function createEmptyTaskState(timestamp = new Date().toISOString()): TaskState {
  return {
    activeFiles: [],
    plannedActions: [],
    completedActions: [],
    blockers: [],
    lastUpdatedAt: timestamp,
  };
}

export function deriveTaskState(messages: StoredMessage[], previous?: TaskState): TaskState {
  const now = new Date().toISOString();
  const currentTurn = findCurrentTurn(messages);
  const objective = currentTurn?.objective ?? previous?.objective;
  const frameMessages = currentTurn ? messages.slice(currentTurn.startIndex) : messages;
  const objectiveChanged =
    typeof previous?.objective === "string" &&
    typeof objective === "string" &&
    oneLine(previous.objective).toLowerCase() !== oneLine(objective).toLowerCase();

  if (objectiveChanged) {
    return {
      objective,
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: now,
    };
  }

  return {
    objective,
    activeFiles: takeLastUnique(collectActiveFiles(frameMessages), MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(collectPlannedActions(frameMessages), MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(collectCompletedActions(frameMessages), MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(collectBlockers(frameMessages), MAX_BLOCKERS),
    lastUpdatedAt: now,
  };
}

export function normalizeTaskState(taskState: TaskState | undefined): TaskState | undefined {
  if (!taskState) {
    return undefined;
  }

  return {
    objective: typeof taskState.objective === "string" ? taskState.objective : undefined,
    activeFiles: takeLastUnique(taskState.activeFiles ?? [], MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(taskState.plannedActions ?? [], MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(taskState.completedActions ?? [], MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(taskState.blockers ?? [], MAX_BLOCKERS),
    lastUpdatedAt:
      typeof taskState.lastUpdatedAt === "string" && taskState.lastUpdatedAt.length > 0
        ? taskState.lastUpdatedAt
        : new Date().toISOString(),
  };
}

export function formatTaskStateBlock(taskState: TaskState | undefined): string {
  if (!taskState) {
    return "- none";
  }

  const parts = [
    taskState.objective ? `- Latest user input: ${taskState.objective}` : "- Latest user input: none",
    `- Planned actions: ${formatList(taskState.plannedActions)}`,
    `- Blockers: ${formatList(taskState.blockers)}`,
    `- Updated at: ${taskState.lastUpdatedAt}`,
  ];

  return parts.join("\n");
}

export { createInternalReminder, isInternalMessage };

export function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    messages: Array.isArray(session.messages) ? session.messages : [],
    taskState: normalizeTaskState(deriveTaskState(Array.isArray(session.messages) ? session.messages : [], session.taskState)),
  };
}

export function applyCurrentTurnFrame(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const userInput = readUserInput(input);
  if (!userInput) {
    return {
      ...session,
      taskState: normalizeTaskState(session.taskState ?? createEmptyTaskState(timestamp)),
    };
  }

  const objective = truncate(userInput, 240);
  return {
    ...session,
    todoItems: [],
    taskState: {
      objective,
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: timestamp,
    },
  };
}

function findCurrentTurn(messages: StoredMessage[]): (Pick<TaskState, "objective"> & {
  startIndex: number;
}) | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const normalized = readUserInput(message.content);
    if (normalized) {
      return {
        objective: truncate(normalized, 240),
        startIndex: index,
      };
    }
  }

  return undefined;
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.unshift(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(" | ") : "none";
}
