import { hasIncompleteTodos } from "../session/todos.js";
import { isVerificationRequired } from "../verification/state.js";
import type { AgentIdentity } from "../types.js";
import type { FunctionToolDefinition } from "../../capabilities/tools/index.js";
import type { SessionRecord, VerificationState } from "../../types.js";

const TASK_CLOSEOUT_TOOL_NAMES = new Set(["task_list", "task_get", "task_update"]);
const CLOSEOUT_TOOL_NAMES = new Set([...TASK_CLOSEOUT_TOOL_NAMES, "todo_write"]);

interface CloseoutParams {
  identity: AgentIdentity;
  session: SessionRecord;
  changedPaths: Set<string>;
  hadIncompleteTodosAtStart: boolean;
  hasSubstantiveToolActivity: boolean;
  verificationState?: VerificationState;
}

export function noteSubstantiveToolActivity(hasActivity: boolean, toolName: string): boolean {
  return hasActivity || !CLOSEOUT_TOOL_NAMES.has(toolName);
}

export function canFinishWithPlanningTodos(params: Pick<CloseoutParams, "changedPaths" | "hadIncompleteTodosAtStart" | "hasSubstantiveToolActivity">): boolean {
  return !params.hadIncompleteTodosAtStart && !params.hasSubstantiveToolActivity && params.changedPaths.size === 0;
}

export function shouldIgnoreIncompleteTodosForCloseout(params: CloseoutParams): boolean {
  return (
    params.identity.kind === "lead" &&
    hasIncompleteTodos(params.session.todoItems) &&
    !canFinishWithPlanningTodos(params) &&
    shouldPreferCloseout(params)
  );
}

export function filterToolDefinitionsForCloseout(
  definitions: FunctionToolDefinition[],
  params: Pick<CloseoutParams, "session" | "changedPaths" | "hasSubstantiveToolActivity" | "verificationState">,
): FunctionToolDefinition[] {
  if (!shouldHideTaskBoardTools(params)) {
    return definitions;
  }

  const shouldHideTodoWrite = !hasIncompleteTodos(params.session.todoItems);
  return definitions.filter((tool) => {
    const name = tool.function.name;
    if (TASK_CLOSEOUT_TOOL_NAMES.has(name)) {
      return false;
    }

    if (name === "todo_write" && shouldHideTodoWrite) {
      return false;
    }

    return true;
  });
}

function shouldHideTaskBoardTools(
  params: Pick<CloseoutParams, "changedPaths" | "verificationState">,
): boolean {
  return hasCloseoutEvidence(params);
}

function hasCloseoutEvidence(
  params: Pick<CloseoutParams, "changedPaths" | "verificationState">,
): boolean {
  return hasChangedPaths(params) || hasPendingVerificationPaths(params) || hasVerificationAttempts(params);
}

function hasChangedPaths(params: Pick<CloseoutParams, "changedPaths">): boolean {
  return params.changedPaths.size > 0;
}

function hasPendingVerificationPaths(params: Pick<CloseoutParams, "verificationState">): boolean {
  return (params.verificationState?.pendingPaths?.length ?? 0) > 0;
}

function hasVerificationAttempts(params: Pick<CloseoutParams, "verificationState">): boolean {
  return (params.verificationState?.attempts ?? 0) > 0;
}

function shouldPreferCloseout(
  params: Pick<CloseoutParams, "changedPaths" | "hasSubstantiveToolActivity" | "verificationState">,
): boolean {
  const verificationSatisfied = !isVerificationRequired(params.verificationState);
  const hasCompletedWorkEvidence =
    params.hasSubstantiveToolActivity ||
    params.changedPaths.size > 0 ||
    (params.verificationState?.attempts ?? 0) > 0;

  return verificationSatisfied && hasCompletedWorkEvidence;
}
