import type { SessionRecord, StoredMessage, TaskState } from "../../types.js";
import { normalizeDelegationDirective, parseDelegationDirective } from "./delegationDirective.js";
import { collectActiveFiles, collectBlockers, collectCompletedActions, collectPlannedActions, oneLine, truncate } from "./taskStateHistory.js";

const MAX_ACTIVE_FILES = 12;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 12;
const MAX_BLOCKERS = 8;
const INTERNAL_PREFIX = "[internal]";

export function createEmptyTaskState(timestamp = new Date().toISOString()): TaskState {
  return {
    delegationDirective: normalizeDelegationDirective(undefined),
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
  const delegationDirective = currentTurn?.delegationDirective ?? normalizeDelegationDirective(previous?.delegationDirective);
  const frameMessages = currentTurn ? messages.slice(currentTurn.startIndex) : messages;
  const objectiveChanged =
    typeof previous?.objective === "string" &&
    typeof objective === "string" &&
    oneLine(previous.objective).toLowerCase() !== oneLine(objective).toLowerCase();

  if (objectiveChanged) {
    return {
      objective,
      delegationDirective,
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
    delegationDirective,
    activeFiles: takeLastUnique(collectActiveFiles(frameMessages), MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(collectPlannedActions(frameMessages), MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(collectCompletedActions(frameMessages), MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(collectBlockers(frameMessages), MAX_BLOCKERS),
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
    delegationDirective: normalizeDelegationDirective(taskState.delegationDirective),
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
    `- Delegation directive: ${formatDelegationDirective(taskState.delegationDirective)}`,
    `- Planned actions: ${formatList(taskState.plannedActions)}`,
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
    taskState: normalizeTaskState(deriveTaskState(Array.isArray(session.messages) ? session.messages : [], session.taskState)),
  };
}

export function applyCurrentTurnFrame(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  if (isInternalMessage(input) || isContinuationDirective(input)) {
    return {
      ...session,
      taskState: normalizeTaskState(session.taskState ?? createEmptyTaskState(timestamp)),
    };
  }

  const parsed = parseDelegationDirective(input);
  const objective = truncate(oneLine(parsed.input || input), 240);
  return {
    ...session,
    todoItems: [],
    taskState: {
      objective,
      delegationDirective: parsed.directive,
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: timestamp,
    },
  };
}

function findCurrentTurn(messages: StoredMessage[]): (Pick<TaskState, "objective" | "delegationDirective"> & { startIndex: number }) | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || isInternalMessage(message.content) || isContinuationDirective(message.content)) {
      continue;
    }

    const normalized = oneLine(message.content ?? "");
    if (normalized) {
      const parsed = parseDelegationDirective(normalized);
      return {
        objective: truncate(oneLine(parsed.input || normalized), 240),
        delegationDirective: parsed.directive,
        startIndex: index,
      };
    }
  }

  return undefined;
}

function formatDelegationDirective(value: TaskState["delegationDirective"]): string {
  const directive = normalizeDelegationDirective(value);
  if (!directive.teammate && !directive.subagent) {
    return "none";
  }

  const lanes = [
    directive.teammate ? "team" : undefined,
    directive.subagent ? "subagent" : undefined,
  ].filter(Boolean);
  return `${lanes.join("+")} (${directive.source})`;
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
