import path from "node:path";

import type { AgentCallbacks } from "../agent/types.js";
import type { RuntimeConfig } from "../types.js";
import { tryParseJson } from "../utils/json.js";
import { ui } from "../utils/console.js";
import { writeStdout } from "../utils/stdio.js";

interface StreamRendererOptions {
  cwd?: string;
  assistantLeadingBlankLine?: boolean;
  assistantTrailingNewlines?: string;
  reasoningLeadingBlankLine?: boolean;
  toolArgsMaxChars?: number;
  toolErrorLabel: string;
  abortSignal?: AbortSignal;
}

interface StreamState {
  assistantOpen: boolean;
  reasoningOpen: boolean;
}

interface ToolDisplay {
  summary: string;
  preview?: string;
}

export interface StreamRenderer {
  callbacks: AgentCallbacks;
  flush: () => void;
}

export function createStreamRenderer(
  config: Pick<RuntimeConfig, "showReasoning">,
  options: StreamRendererOptions,
): StreamRenderer {
  let aborted = false;
  const isAborted = (): boolean => aborted || options.abortSignal?.aborted === true;

  const state: StreamState = {
    assistantOpen: false,
    reasoningOpen: false,
  };
  const flush = (): void => {
    if (!state.reasoningOpen && !state.assistantOpen) {
      return;
    }

    writeStdout("\n");
    state.reasoningOpen = false;
    state.assistantOpen = false;
  };

  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", () => {
      if (aborted) {
        return;
      }
      aborted = true;
      flush();
    });
  }

  const beginReasoning = (): void => {
    if (!config.showReasoning) {
      return;
    }

    if (!state.reasoningOpen) {
      writeStdout(options.reasoningLeadingBlankLine ? "\n[reasoning]\n" : "[reasoning]\n");
      state.reasoningOpen = true;
    }
  };

  const beginAssistant = (): void => {
    if (state.reasoningOpen) {
      writeStdout("\n");
      state.reasoningOpen = false;
    }

    if (!state.assistantOpen) {
      if (options.assistantLeadingBlankLine) {
        writeStdout("\n");
      }
      state.assistantOpen = true;
    }
  };

  return {
    flush,
    callbacks: {
      onReasoningDelta(delta) {
        if (isAborted()) {
          return;
        }

        if (!config.showReasoning) {
          return;
        }

        beginReasoning();
        writeStdout(delta);
      },
      onReasoning(text) {
        if (isAborted()) {
          return;
        }

        if (!config.showReasoning) {
          return;
        }

        beginReasoning();
        writeStdout(`${text}\n`);
        state.reasoningOpen = false;
      },
      onAssistantDelta(delta) {
        if (isAborted()) {
          return;
        }

        beginAssistant();
        writeStdout(delta);
      },
      onAssistantText(text) {
        if (isAborted()) {
          return;
        }

        beginAssistant();
        writeStdout(text);
      },
      onAssistantDone() {
        if (isAborted()) {
          return;
        }

        if (state.reasoningOpen) {
          writeStdout("\n");
          state.reasoningOpen = false;
        }

        if (state.assistantOpen) {
          writeStdout(options.assistantTrailingNewlines ?? "\n");
          state.assistantOpen = false;
        }
      },
      onToolCall(name, args) {
        if (isAborted()) {
          return;
        }

        flush();
        const display = buildToolCallDisplay(name, args, options.toolArgsMaxChars ?? 160, options.cwd);
        ui.tool(display.summary);
        if (display.preview) {
          ui.dim(`[content]\n${display.preview}`);
        }
      },
      onToolResult(name, output) {
        if (isAborted()) {
          return;
        }

        flush();
        const display = buildToolResultDisplay(name, output, options.cwd);
        if (display.summary) {
          ui.dim(`[result] ${display.summary}`);
        }
        if (display.preview) {
          ui.dim(`[preview]\n${display.preview}`);
        }
      },
      onToolError(name, error) {
        if (isAborted()) {
          return;
        }

        flush();
        ui.warn(`${name} ${options.toolErrorLabel}`);
        ui.dim(truncate(error, 600));
      },
      onStatus(text) {
        if (isAborted()) {
          return;
        }

        flush();
        ui.dim(text);
      },
    },
  };
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

function buildToolCallDisplay(
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
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
      };
    case "list_files":
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (args.recursive === true ? " (recursive)" : ""),
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
      const oldString = readStringField(args, "old_string");
      const newString = readStringField(args, "new_string");
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (args.replace_all === true ? " replace_all=true" : ""),
        preview: buildReplacementPreview(oldString, newString),
      };
    }
    case "apply_patch":
      return {
        summary: `${name}`,
        preview: typeof args.patch === "string" ? truncateBlock(args.patch, 2_000) : undefined,
      };
    case "run_shell": {
      const command = readStringField(args, "command");
      const cwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (cwd ? ` cwd=${cwd}` : ""),
      };
    }
    case "background_run": {
      const command = readStringField(args, "command");
      const cwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (cwd ? ` cwd=${cwd}` : ""),
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
        preview: formatTodoItemsPreview(items),
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

function buildToolResultDisplay(name: string, rawOutput: string, cwd?: string): ToolDisplay {
  const parsed = tryParseJson(rawOutput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      summary: name,
      preview: truncateBlock(rawOutput, 1_600),
    };
  }

  const output = parsed as Record<string, unknown>;
  if (name === "task") {
    const description = readStringField(output, "description");
    const agentType = readStringField(output, "agentType");
    return {
      summary:
        [name, agentType, description ? `"${description}"` : undefined].filter(Boolean).join(" "),
      preview:
        readPrimaryPreview(output, cwd) ??
        formatFallbackObjectPreview(output, cwd),
    };
  }

  const path = normalizeDisplayPath(readStringField(output, "path"), cwd);
  const preview =
    readPrimaryPreview(output, cwd) ??
    (name === "list_files" ? formatEntriesPreview(output.entries, cwd) : undefined) ??
    (name === "search_files" ? formatMatchesPreview(output.matches, cwd) : undefined) ??
    (name === "read_spreadsheet" ? formatSheetsPreview(output.sheets) : undefined) ??
    formatFallbackObjectPreview(output, cwd);

  return {
    summary: [name, path].filter(Boolean).join(" "),
    preview,
  };
}

function readPrimaryPreview(payload: Record<string, unknown>, cwd?: string): string | undefined {
  for (const key of ["content", "preview", "output", "markdownPreview"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return truncateBlock(rewriteAbsolutePaths(value, cwd), 1_600);
    }
  }

  return undefined;
}

function formatEntriesPreview(value: unknown, cwd?: string): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 24)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const type = record.type === "directory" ? "dir " : "file";
      const displayPath = normalizeDisplayPath(readStringField(record, "path"), cwd);
      return displayPath ? `${type} ${displayPath}` : null;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatMatchesPreview(value: unknown, cwd?: string): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 16)
    .map((match) => {
      if (!match || typeof match !== "object") {
        return null;
      }

      const record = match as Record<string, unknown>;
      const displayPath = normalizeDisplayPath(readStringField(record, "path"), cwd);
      const line = typeof record.line === "number" ? record.line : undefined;
      const text = readStringField(record, "text");
      if (!displayPath || !text) {
        return null;
      }

      return `${displayPath}${line ? `:${line}` : ""}\n  ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatSheetsPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const fragments: string[] = [];

  for (const sheet of value.slice(0, 3)) {
    if (!sheet || typeof sheet !== "object") {
      continue;
    }

    const record = sheet as Record<string, unknown>;
    const name = readStringField(record, "name") ?? "Sheet";
    fragments.push(`sheet: ${name}`);

    if (Array.isArray(record.preview)) {
      for (const row of record.preview.slice(0, 6)) {
        if (!row || typeof row !== "object") {
          continue;
        }

        const rowRecord = row as Record<string, unknown>;
        const cells = Array.isArray(rowRecord.cells)
          ? rowRecord.cells.map((cell) => String(cell)).join(" | ")
          : "";
        if (cells) {
          fragments.push(`  ${cells}`);
        }
      }
    }
  }

  return fragments.length > 0 ? fragments.join("\n") : undefined;
}

function formatFallbackObjectPreview(value: Record<string, unknown>, cwd?: string): string | undefined {
  const keys = ["reason", "error", "hint", "action", "suggestedPath", "suggestedTool"];
  const fragments = keys
    .map((key) => {
      const field = value[key];
      return typeof field === "string" && field.trim().length > 0
        ? `${key}: ${normalizeDisplayPath(field, cwd) ?? rewriteAbsolutePaths(field, cwd)}`
        : null;
    })
    .filter((line): line is string => Boolean(line));

  return fragments.length > 0 ? fragments.join("\n") : undefined;
}

function formatTodoItemsPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 12)
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const id = readStringField(record, "id");
      const text = readStringField(record, "text");
      const status = readStringField(record, "status");
      if (!id || !text || !status) {
        return null;
      }

      return `${formatTodoMarker(status)} #${id}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
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

function readStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatLineRange(startLine: unknown, endLine: unknown): string {
  const start = typeof startLine === "number" && Number.isFinite(startLine) ? Math.trunc(startLine) : undefined;
  const end = typeof endLine === "number" && Number.isFinite(endLine) ? Math.trunc(endLine) : undefined;

  if (start && end) {
    return `:${start}-${end}`;
  }

  if (start) {
    return `:${start}+`;
  }

  return "";
}

function truncateBlock(value: string, maxChars: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}\n... [truncated]`;
}

function normalizeDisplayPath(value: string | undefined, cwd?: string): string | undefined {
  if (!value) {
    return value;
  }

  if (!cwd) {
    return value;
  }

  const normalizedCwd = path.resolve(cwd);
  const normalizedValue = path.resolve(value);
  if (
    normalizedValue === normalizedCwd ||
    normalizedValue.startsWith(`${normalizedCwd}${path.sep}`)
  ) {
    return path.relative(normalizedCwd, normalizedValue) || ".";
  }

  return value;
}

function rewriteAbsolutePaths(value: string, cwd?: string): string {
  if (!cwd) {
    return value;
  }

  const normalizedCwd = path.resolve(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${normalizedCwd}(?:\\\\[^\\s"']*|/[^\\s"']*)*`, "g");

  return value.replace(pattern, (match) => normalizeDisplayPath(match, cwd) ?? match);
}

function formatTodoMarker(status: string): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    default:
      return "[ ]";
  }
}
