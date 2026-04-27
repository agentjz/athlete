import { hasIncompleteTodos } from "../session/todos.js";
import { normalizeDelegationCapabilities } from "../session/delegationDirective.js";
import type { AgentIdentity } from "../types.js";
import type { SessionRecord } from "../../types.js";
import { classifyCommand } from "../../utils/commandPolicy.js";

const PLAN_REQUIRED_TOOLS = new Set([
  "write_file",
  "edit_file",
  "apply_patch",
  "write_docx",
  "edit_docx",
  "run_shell",
  "background_run",
]);

const DELEGATION_TOOLS = new Set(["spawn_teammate", "task"]);

export function getPlanBlockedResult(
  toolName: string,
  rawArgs: string,
  session: SessionRecord,
  identity: AgentIdentity,
): { ok: false; output: string } | null {
  if (identity.kind === "subagent") {
    return null;
  }

  const delegationBlock = getDelegationToolBlock(toolName, session);
  if (identity.kind === "lead" && delegationBlock) {
    return {
      ok: false,
      output: JSON.stringify(
        {
          ok: false,
          error: "Delegation lane is closed for this runtime.",
          code: "DELEGATION_LANE_CLOSED",
          hint: delegationBlock.hint,
          next_step: delegationBlock.nextStep,
        },
        null,
        2,
      ),
    };
  }

  if (!PLAN_REQUIRED_TOOLS.has(toolName)) {
    return null;
  }

  if (toolName === "run_shell" || toolName === "background_run") {
    const command = readCommandFromArgs(rawArgs);
    if (command) {
      const classification = classifyCommand(command);
      if (classification.isReadOnly || classification.validationKind) {
        return null;
      }
    }
  }

  if (hasIncompleteTodos(session.todoItems)) {
    return null;
  }

  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        error: "Plan required before executing a mutating tool.",
        code: "PLAN_REQUIRED",
        hint: "Call todo_write first with a short plan (keep one item in_progress), then retry the tool call.",
        suggestedTool: "todo_write",
      },
      null,
      2,
    ),
  };
}

function getDelegationToolBlock(
  toolName: string,
  session: SessionRecord,
): { hint: string; nextStep: string } | null {
  if (!DELEGATION_TOOLS.has(toolName)) {
    return null;
  }

  const capabilities = normalizeDelegationCapabilities(session.taskState?.delegationCapabilities);
  if (toolName === "spawn_teammate" && capabilities.teammate) {
    return null;
  }
  if (toolName === "task" && capabilities.subagent) {
    return null;
  }

  const requiredLane = toolName === "task" ? "--subagent or --allpeople" : "--team or --allpeople";
  return {
    hint: `Run the work directly as Lead, or restart the runtime with ${requiredLane}.`,
    nextStep: `Do not call ${toolName} unless this runtime opened that exact delegation lane.`,
  };
}

export function readCommandFromArgs(rawArgs: string): string | null {
  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
    return typeof parsed.command === "string" ? parsed.command : null;
  } catch {
    return null;
  }
}
