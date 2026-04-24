import { tryParseJson } from "../../../utils/json.js";
import { normalizeDisplayPath } from "../pathDisplay.js";
import { summarizePatchPreview, truncate, truncateBlock } from "../previewPolicy.js";
import { formatLineRange, readStringField } from "./shared.js";
import type { ToolDisplay } from "./types.js";

export function buildToolCallDisplay(
  name: string,
  rawArgs: string,
  maxChars: number,
  cwd?: string,
): ToolDisplay {
  const parsed = tryParseJson(rawArgs);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      summary: `${name} ${truncate(rawArgs, maxChars)}`,
    };
  }

  const args = parsed as Record<string, unknown>;
  const path = normalizeDisplayPath(readStringField(args, "path"), cwd);
  const content = readStringField(args, "content");

  switch (name) {
    case "read_file": {
      const range = formatLineRange(args.start_line, args.end_line);
      return {
        summary: `${name} ${path ?? "(missing path)"}${range}`,
      };
    }
    case "read_docx":
    case "mineru_doc_read":
    case "mineru_image_read":
    case "mineru_pdf_read":
    case "mineru_ppt_read":
    case "read_spreadsheet":
    case "download_url":
    case "http_probe":
      return {
        summary: `${name} ${path ?? readStringField(args, "url") ?? "(missing path)"}`,
      };
    case "list_files":
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (args.recursive === true ? " (recursive)" : ""),
      };
    case "find_files":
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (typeof args.pattern === "string" ? ` pattern=${args.pattern}` : ""),
      };
    case "search_files":
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (typeof args.pattern === "string" ? ` pattern=${args.pattern}` : ""),
      };
    case "write_file":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
        preview: content ? truncateBlock(content, 1_600) : undefined,
      };
    case "write_docx":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
        preview: content ? truncateBlock(content, 1_600) : undefined,
      };
    case "edit_docx": {
      const action = readStringField(args, "action");
      const heading = readStringField(args, "heading");
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (action ? ` action=${action}` : "") +
          (heading ? ` heading=${heading}` : ""),
        preview: content ? truncateBlock(content, 1_600) : undefined,
      };
    }
    case "edit_file": {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (edits.length > 0 ? ` edits=${edits.length}` : ""),
        preview: buildEditBatchPreview(edits),
      };
    }
    case "apply_patch":
      return {
        summary: `${name}`,
        preview: typeof args.patch === "string" ? summarizePatchPreview(args.patch) : undefined,
      };
    case "run_shell": {
      const command = readStringField(args, "command");
      const runCwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (runCwd ? ` cwd=${runCwd}` : ""),
      };
    }
    case "background_run": {
      const command = readStringField(args, "command");
      const runCwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (runCwd ? ` cwd=${runCwd}` : ""),
      };
    }
    case "background_check": {
      const jobId = readStringField(args, "job_id");
      return {
        summary: `${name} ${jobId ?? "recent"}`.trim(),
      };
    }
    case "task": {
      const agentType = readStringField(args, "agent_type");
      const description = readStringField(args, "description");
      return {
        summary:
          `${name} ${agentType ?? ""}`.trim() +
          (description ? ` "${description}"` : ""),
      };
    }
    case "worktree_create": {
      const worktreeName = readStringField(args, "name");
      const taskId = typeof args.task_id === "number" ? Math.trunc(args.task_id) : undefined;
      return {
        summary: `${name} ${worktreeName ?? ""}`.trim() + (taskId ? ` task=${taskId}` : ""),
      };
    }
    case "worktree_get":
    case "worktree_events":
    case "worktree_keep":
    case "worktree_remove": {
      const worktreeName = readStringField(args, "name");
      return {
        summary: `${name} ${worktreeName ?? ""}`.trim(),
      };
    }
    case "task_create": {
      const subject = readStringField(args, "subject");
      return {
        summary: `${name} ${subject ?? ""}`.trim(),
      };
    }
    case "task_update": {
      const taskId = typeof args.task_id === "number" ? Math.trunc(args.task_id) : undefined;
      const status = readStringField(args, "status");
      return {
        summary:
          `${name} #${taskId ?? "?"}` +
          (status ? ` status=${status}` : ""),
      };
    }
    case "claim_task": {
      const taskId = typeof args.task_id === "number" ? Math.trunc(args.task_id) : undefined;
      return {
        summary: `${name} #${taskId ?? "?"}`,
      };
    }
    case "spawn_teammate": {
      const teammate = readStringField(args, "name");
      const role = readStringField(args, "role");
      return {
        summary: `${name} ${teammate ?? ""}`.trim() + (role ? ` role=${role}` : ""),
      };
    }
    case "send_message": {
      const recipient = readStringField(args, "to");
      const msgType = readStringField(args, "msg_type");
      return {
        summary: `${name} ${recipient ?? ""}`.trim() + (msgType ? ` type=${msgType}` : ""),
      };
    }
    case "task_list":
    case "worktree_list":
    case "list_teammates":
    case "read_inbox":
    case "broadcast":
    case "idle":
    case "plan_approval":
    case "shutdown_request":
    case "shutdown_response":
      return {
        summary: name,
      };
    case "todo_write": {
      const items = Array.isArray(args.items) ? args.items : [];
      return {
        summary: `${name} items=${items.length}`,
      };
    }
    case "load_skill": {
      const skillName = readStringField(args, "name");
      return {
        summary: `${name} ${skillName ?? ""}`.trim(),
      };
    }
    default:
      return {
        summary: `${name} ${truncate(rawArgs, maxChars)}`,
      };
  }
}

function buildReplacementPreview(oldString: string | undefined, newString: string | undefined): string | undefined {
  const fragments: string[] = [];

  if (oldString) {
    fragments.push(`- old\n${truncateBlock(oldString, 700)}`);
  }

  if (newString) {
    fragments.push(`+ new\n${truncateBlock(newString, 700)}`);
  }

  return fragments.length > 0 ? fragments.join("\n") : undefined;
}

function buildEditBatchPreview(value: unknown[]): string | undefined {
  const fragments: string[] = [];
  const maxInspectedEdits = 8;

  for (const entry of value.slice(0, maxInspectedEdits)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const oldString = readStringField(record, "old_string");
    const newString = readStringField(record, "new_string");
    const preview = buildReplacementPreview(oldString, newString);
    if (preview) {
      fragments.push(preview);
    }
  }

  if (fragments.length === 0) {
    return undefined;
  }

  const firstPreview = fragments[0]!;
  const inspectedRemaining = Math.max(0, fragments.length - 1);
  const omittedRemaining = Math.max(0, value.length - maxInspectedEdits);
  const remaining = inspectedRemaining + omittedRemaining;
  return remaining > 0
    ? `${firstPreview}\n\n... (${remaining} more edit(s))`
    : firstPreview;
}
