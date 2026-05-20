import { tryParseJson } from "../../utils/json.js";
import { normalizeDisplayPath } from "../pathDisplay.js";
import { truncate } from "../previewPolicy.js";
import { readStringField } from "./shared.js";
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

  switch (name) {
    case "read": {
      const offset = typeof args.offset === "number" ? Math.trunc(args.offset) : undefined;
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : undefined;
      const range = offset === undefined
        ? ""
        : limit === undefined
          ? `:${offset}`
          : `:${offset}-${Math.max(offset, offset + limit - 1)}`;
      return {
        summary: `${name} ${path ?? "(missing path)"}${range}`,
      };
    }
    case "write":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
      };
    case "edit": {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (edits.length > 0 ? ` edits=${edits.length}` : ""),
      };
    }
    case "bash": {
      const command = readStringField(args, "command");
      const runCwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (runCwd ? ` cwd=${runCwd}` : ""),
      };
    }
    case "download_url":
      return {
        summary: `${name} ${readStringField(args, "url") ?? "(missing url)"} -> ${path ?? "(missing path)"}`,
      };
    case "http_probe": {
      const method = readStringField(args, "method") ?? "HEAD";
      return {
        summary: `${name} ${method.toUpperCase()} ${readStringField(args, "url") ?? "(missing url)"}`,
      };
    }
    case "http_request": {
      const method = readStringField(args, "method") ?? "GET";
      const sessionId = readStringField(args, "session_id");
      return {
        summary:
          `${name} ${method.toUpperCase()} ${readStringField(args, "url") ?? "(missing url)"}` +
          (sessionId ? ` session=${sessionId}` : ""),
      };
    }
    case "http_session": {
      const action = readStringField(args, "action") ?? "list";
      const sessionId = readStringField(args, "session_id");
      return {
        summary: `${name} ${action}${sessionId ? ` ${sessionId}` : ""}`,
      };
    }
    case "http_suite": {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      const sessionId = readStringField(args, "session_id");
      return {
        summary: `${name} steps=${steps.length}${sessionId ? ` session=${sessionId}` : ""}`,
      };
    }
    case "network_trace":
      return {
        summary: `${name} ${readStringField(args, "trace_id") ?? "(missing trace_id)"}`,
      };
    case "openapi_inspect":
    case "openapi_lint":
      return {
        summary: `${name} ${readStringField(args, "source") ?? "(missing source)"}`,
      };
    case "worktree_create": {
      const branch = readStringField(args, "branch");
      return {
        summary: `${name} ${path ?? "(missing path)"}${branch ? ` branch=${branch}` : ""}`,
      };
    }
    case "worktree_get":
    case "worktree_keep":
    case "worktree_remove":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
      };
    case "worktree_events": {
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : undefined;
      return {
        summary: `${name}${limit ? ` limit=${limit}` : ""}`,
      };
    }
    case "worktree_list":
      return {
        summary: name,
      };
    case "todo_write": {
      const items = Array.isArray(args.items) ? args.items : [];
      return {
        summary: `${name} items=${items.length}`,
      };
    }
    case "spec_list":
      return {
        summary: name,
      };
    case "spec_search":
      return {
        summary: `${name} ${readStringField(args, "query") ?? ""}`.trim(),
      };
    case "spec_create":
    case "spec_write_document": {
      const title = readStringField(args, "title");
      return {
        summary: `${name}${title ? ` ${title}` : ""}`.trim(),
      };
    }
    case "spec_open":
    case "spec_update_state":
    case "spec_append_note":
    case "spec_read_document":
    case "spec_checkpoint_list":
    case "spec_task_update": {
      const taskId = readStringField(args, "task_id");
      return {
        summary: `${name}${taskId ? ` task=${taskId}` : ""}`.trim(),
      };
    }
    case "spec_checkpoint_create": {
      const label = readStringField(args, "label");
      return {
        summary: `${name}${label ? ` ${label}` : ""}`.trim(),
      };
    }
    case "spec_checkpoint_restore": {
      const checkpointId = readStringField(args, "checkpoint_id");
      return {
        summary: `${name}${checkpointId ? ` ${checkpointId}` : ""}`.trim(),
      };
    }
    default:
      return {
        summary: `${name} ${truncate(rawArgs, maxChars)}`,
      };
  }
}
