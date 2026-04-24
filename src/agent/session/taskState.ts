import type { SessionRecord, StoredMessage, TaskState } from "../../types.js";
import { collectActiveFiles, collectBlockers, collectCompletedActions, collectPlannedActions, oneLine, truncate } from "./taskStateHistory.js";

const MAX_ACTIVE_FILES = 12;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 12;
const MAX_BLOCKERS = 8;
const INTERNAL_PREFIX = "[internal]";

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
  const objective = findObjective(messages) ?? previous?.objective;
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
      orchestratorReturnBarrier: normalizeReturnBarrier(previous?.orchestratorReturnBarrier),
      lastUpdatedAt: now,
    };
  }

  return {
    objective,
    activeFiles: takeLastUnique(collectActiveFiles(messages), MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(collectPlannedActions(messages), MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(collectCompletedActions(messages), MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(collectBlockers(messages), MAX_BLOCKERS),
    orchestratorReturnBarrier: normalizeReturnBarrier(previous?.orchestratorReturnBarrier),
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
    orchestratorReturnBarrier: normalizeReturnBarrier(taskState.orchestratorReturnBarrier),
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
    taskState.objective ? `- Objective: ${taskState.objective}` : "- Objective: none",
    `- Active files: ${formatList(taskState.activeFiles)}`,
    `- Planned actions: ${formatList(taskState.plannedActions)}`,
    `- Completed actions: ${formatList(taskState.completedActions)}`,
    `- Blockers: ${formatList(taskState.blockers)}`,
    `- Updated at: ${taskState.lastUpdatedAt}`,
  ];

  return parts.join("\n");
}

export function isInternalMessage(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().toLowerCase().startsWith(INTERNAL_PREFIX);
}

export function isContinuationDirective(content: string | null | undefined): boolean {
  if (typeof content !== "string") {
    return false;
  }

  const normalized = oneLine(content).toLowerCase();
  if (!normalized || isInternalMessage(normalized)) {
    return false;
  }

  return (
    /^(continue|resume|go on|keep going|carry on|proceed|continue please|resume please)$/.test(normalized) ||
    /^(continue|resume)\b.*\b(current|same|existing|task|checkpoint|where you left off)\b/.test(normalized) ||
    /^(继续|继续吧|接着|接着做|继续做|继续处理|继续执行|恢复)$/.test(normalized)
  );
}

export function createInternalReminder(text: string): string {
  return `${INTERNAL_PREFIX} ${text}`.trim();
}

export function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    messages: Array.isArray(session.messages) ? session.messages : [],
    taskState: normalizeTaskState(
      session.taskState ?? deriveTaskState(Array.isArray(session.messages) ? session.messages : []),
    ),
  };
}

function findObjective(messages: StoredMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || isInternalMessage(message.content) || isContinuationDirective(message.content)) {
      continue;
    }

    const normalized = oneLine(message.content ?? "");
    if (normalized) {
      return truncate(normalized, 240);
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

function normalizeReturnBarrier(
  value: TaskState["orchestratorReturnBarrier"],
): TaskState["orchestratorReturnBarrier"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const taskId = Number(value.taskId);
  return {
    pending: Boolean(value.pending),
    sourceAction:
      value.sourceAction === "delegate_subagent" ||
      value.sourceAction === "delegate_teammate" ||
      value.sourceAction === "run_in_background"
        ? value.sourceAction
        : undefined,
    taskId: Number.isFinite(taskId) && taskId > 0 ? Math.trunc(taskId) : undefined,
    setAt: typeof value.setAt === "string" && value.setAt.trim().length > 0 ? value.setAt.trim() : undefined,
  };
}
