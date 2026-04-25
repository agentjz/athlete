import { hasIncompleteTodos } from "../session/todos.js";
import { hasDelegationDirective } from "../session/delegationDirective.js";
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

  if (identity.kind === "lead" && DELEGATION_TOOLS.has(toolName) && !hasDelegationDirective(session.taskState?.delegationDirective)) {
    return {
      ok: false,
      output: JSON.stringify(
        {
          ok: false,
          error: "Delegation requires an explicit user prefix.",
          code: "DELEGATION_PREFIX_REQUIRED",
          hint: "Run the task directly as Lead, or ask the user to start the next request with @team, @subagent, or @allpeople.",
          next_step: "Do not spawn teammates or subagents for this turn unless the current user objective carries an explicit delegation prefix.",
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

export function readCommandFromArgs(rawArgs: string): string | null {
  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
    return typeof parsed.command === "string" ? parsed.command : null;
  } catch {
    return null;
  }
}
