import { hasIncompleteTodos } from "../session/todos.js";
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

export function getPlanBlockedResult(
  toolName: string,
  rawArgs: string,
  session: SessionRecord,
  identity: AgentIdentity,
): { ok: false; output: string } | null {
  if (identity.kind === "subagent") {
    return null;
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
