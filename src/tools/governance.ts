import { ToolExecutionError } from "./errors.js";
import type {
  RegisteredTool,
  ToolGovernance,
  ToolRegistryBlockedTool,
  ToolRegistryEntry,
} from "./types.js";
import type { ToolExecutionResult } from "../types.js";

const WEB_WORKFLOWS = ["web-research", "browser-automation"] as const;

const BUILTIN_CATALOG = new Map<string, ToolGovernance>([
  ...defineMany(["list_files", "read_file", "search_files"], readTool("filesystem", { fallbackOnlyInWorkflows: WEB_WORKFLOWS, concurrencySafe: true })),
  ...defineMany(["mineru_pdf_read", "mineru_image_read", "mineru_doc_read", "mineru_ppt_read", "read_docx", "read_spreadsheet"], readTool("document", { concurrencySafe: true })),
  ...defineMany(["task_list", "task_get"], readTool("task", { concurrencySafe: true })),
  ...defineMany(["list_teammates", "read_inbox"], readTool("team", { concurrencySafe: true })),
  ...defineMany(["worktree_list", "worktree_get", "worktree_events"], readTool("worktree", { concurrencySafe: true })),
  ...defineMany(["background_check"], readTool("background", { concurrencySafe: true })),
  ["http_probe", readTool("external", { concurrencySafe: true, verificationSignal: "optional" })],
  ...defineMany(["todo_write", "load_skill", "claim_task", "task_create", "task_update", "idle"], stateTool("task")),
  ...defineMany(["coordination_policy", "plan_approval"], stateTool("team", { risk: "medium" })),
  ...defineMany(["broadcast", "send_message"], stateTool("messaging", { risk: "medium" })),
  ...defineMany(["worktree_create", "worktree_keep"], stateTool("worktree", { risk: "medium" })),
  ...defineMany(["write_file", "edit_file", "apply_patch"], writeTool("filesystem", { changeSignal: "required" })),
  ...defineMany(["write_docx", "edit_docx"], writeTool("document", { changeSignal: "required" })),
  ["undo_last_change", writeTool("filesystem", { risk: "high", destructive: true, changeSignal: "required" })],
  ["task", stateTool("task", { risk: "medium", changeSignal: "optional", verificationSignal: "optional" })],
  ["download_url", writeTool("external", { changeSignal: "required" })],
  ["run_shell", writeTool("shell", { risk: "high", changeSignal: "none", verificationSignal: "optional", fallbackOnlyInWorkflows: WEB_WORKFLOWS })],
  ["background_run", writeTool("background", { risk: "high", changeSignal: "none", fallbackOnlyInWorkflows: WEB_WORKFLOWS })],
  ["spawn_teammate", stateTool("team", { risk: "high" })],
  ["shutdown_request", stateTool("team", { risk: "high", destructive: true })],
  ["shutdown_response", stateTool("team", { risk: "high" })],
  ["worktree_remove", stateTool("worktree", { risk: "high", destructive: true })],
  ["telegram_send_file", stateTool("messaging", { risk: "medium" })],
  ["weixin_send_file", stateTool("messaging", { risk: "medium" })],
]);

export function resolveToolRegistryEntries(
  tools: readonly RegisteredTool[],
): {
  entries: ToolRegistryEntry[];
  blocked: ToolRegistryBlockedTool[];
} {
  const entries: ToolRegistryEntry[] = [];
  const blocked: ToolRegistryBlockedTool[] = [];

  for (const tool of tools) {
    const resolved = resolveToolGovernance(tool);
    if ("blocked" in resolved) {
      blocked.push(resolved.blocked);
      continue;
    }

    entries.push({
      name: tool.definition.function.name,
      definition: tool.definition,
      governance: resolved.governance,
      origin: tool.origin ?? { kind: resolved.governance.source },
      tool,
    });
  }

  return { entries, blocked };
}

export function resolveToolGovernance(
  tool: RegisteredTool,
): {
  governance: ToolGovernance;
} | {
  blocked: ToolRegistryBlockedTool;
} {
  const name = tool.definition.function.name;
  const inferred = inferToolGovernance(name, tool.origin);
  const partial = tool.governance ? { ...inferred, ...tool.governance } : inferred;

  if (!partial) {
    if (name.startsWith("mcp_")) {
      return {
        blocked: {
          name,
          reason: "Blocked by tool governance: MCP tool is missing safe governance metadata and no trusted readOnly hint was provided.",
          origin: tool.origin ?? { kind: "mcp" },
        },
      };
    }

    throw new Error(`Tool governance metadata is required for ${name}.`);
  }

  return {
    governance: normalizeToolGovernance(name, partial),
  };
}

export function getToolGovernanceForName(name: string): ToolGovernance | null {
  return inferToolGovernance(name, name.startsWith("mcp_") ? { kind: "mcp" } : undefined);
}

export function validateToolExecutionResult(
  entry: Pick<ToolRegistryEntry, "name" | "governance">,
  result: ToolExecutionResult,
): ToolExecutionResult {
  if (!result.ok) {
    return result;
  }

  const changedPaths = result.metadata?.changedPaths?.length ?? 0;
  const verificationAttempted = result.metadata?.verification?.attempted === true;

  if (entry.governance.changeSignal === "required" && changedPaths === 0) {
    throw new ToolExecutionError(
      `${entry.name} must emit changedPaths metadata.`,
      { code: "CHANGE_SIGNAL_REQUIRED", details: { toolName: entry.name } },
    );
  }

  if (entry.governance.changeSignal === "none" && changedPaths > 0) {
    throw new ToolExecutionError(
      `${entry.name} emitted changedPaths metadata even though its governance marks it as non-changing.`,
      { code: "CHANGE_SIGNAL_FORBIDDEN", details: { toolName: entry.name } },
    );
  }

  if (entry.governance.verificationSignal === "required" && !verificationAttempted) {
    throw new ToolExecutionError(
      `${entry.name} must emit verification metadata.`,
      { code: "VERIFICATION_SIGNAL_REQUIRED", details: { toolName: entry.name } },
    );
  }

  if (entry.governance.verificationSignal === "none" && verificationAttempted) {
    throw new ToolExecutionError(
      `${entry.name} emitted verification metadata even though its governance marks it as verification-free.`,
      { code: "VERIFICATION_SIGNAL_FORBIDDEN", details: { toolName: entry.name } },
    );
  }

  return result;
}

export function isBrowserGovernedTool(governance: Pick<ToolGovernance, "specialty">): boolean {
  return governance.specialty === "browser";
}

export function getBrowserStepRank(governance: Pick<ToolGovernance, "browserStep" | "specialty">): number {
  if (governance.specialty !== "browser") {
    return 20;
  }

  switch (governance.browserStep) {
    case "navigate":
      return 0;
    case "snapshot":
      return 1;
    case "take_screenshot":
      return 2;
    case "click":
      return 3;
    case "type":
      return 4;
    default:
      return 20;
  }
}

function inferToolGovernance(
  name: string,
  origin?: RegisteredTool["origin"],
): ToolGovernance | null {
  const builtin = BUILTIN_CATALOG.get(name);
  if (builtin) {
    return cloneGovernance(builtin);
  }

  if (/^mcp_playwright_browser_/i.test(name)) {
    return cloneGovernance(playwrightBrowserTool(name));
  }

  if (name.startsWith("mcp_") && origin?.readOnlyHint === true) {
    return readTool("external", { source: "mcp", risk: "low" });
  }

  return null;
}

function normalizeToolGovernance(name: string, partial: Partial<ToolGovernance>): ToolGovernance {
  const governance: ToolGovernance = {
    source: partial.source ?? (name.startsWith("mcp_") ? "mcp" : "builtin"),
    specialty: requireField(name, partial.specialty, "specialty"),
    mutation: requireField(name, partial.mutation, "mutation"),
    risk: requireField(name, partial.risk, "risk"),
    destructive: partial.destructive ?? false,
    concurrencySafe: requireField(name, partial.concurrencySafe, "concurrencySafe"),
    changeSignal: requireField(name, partial.changeSignal, "changeSignal"),
    verificationSignal: requireField(name, partial.verificationSignal, "verificationSignal"),
    preferredWorkflows: [...(partial.preferredWorkflows ?? [])],
    fallbackOnlyInWorkflows: [...(partial.fallbackOnlyInWorkflows ?? [])],
    browserStep: partial.browserStep,
  };

  if (governance.mutation === "read" && governance.destructive) {
    throw new Error(`Tool governance for ${name} is invalid: read-only tools cannot be destructive.`);
  }

  if (governance.mutation === "read" && governance.changeSignal !== "none") {
    throw new Error(`Tool governance for ${name} is invalid: read-only tools cannot require change signals.`);
  }

  return governance;
}

function requireField<T>(name: string, value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Tool governance metadata for ${name} is missing "${field}".`);
  }

  return value;
}

function cloneGovernance(governance: ToolGovernance): ToolGovernance {
  return {
    ...governance,
    preferredWorkflows: [...governance.preferredWorkflows],
    fallbackOnlyInWorkflows: [...governance.fallbackOnlyInWorkflows],
  };
}

function defineMany(
  names: readonly string[],
  governance: ToolGovernance,
): Array<[string, ToolGovernance]> {
  return names.map((name) => [name, cloneGovernance(governance)]);
}

function readTool(
  specialty: ToolGovernance["specialty"],
  overrides: Partial<ToolGovernance> = {},
): ToolGovernance {
  return buildGovernance(specialty, "read", "low", overrides);
}

function stateTool(
  specialty: ToolGovernance["specialty"],
  overrides: Partial<ToolGovernance> = {},
): ToolGovernance {
  return buildGovernance(specialty, "state", "low", overrides);
}

function writeTool(
  specialty: ToolGovernance["specialty"],
  overrides: Partial<ToolGovernance> = {},
): ToolGovernance {
  return buildGovernance(specialty, "write", "medium", overrides);
}

function buildGovernance(
  specialty: ToolGovernance["specialty"],
  mutation: ToolGovernance["mutation"],
  risk: ToolGovernance["risk"],
  overrides: Partial<ToolGovernance>,
): ToolGovernance {
  return {
    source: overrides.source ?? "builtin",
    specialty,
    mutation,
    risk: overrides.risk ?? risk,
    destructive: overrides.destructive ?? false,
    concurrencySafe: overrides.concurrencySafe ?? false,
    changeSignal: overrides.changeSignal ?? "none",
    verificationSignal: overrides.verificationSignal ?? "none",
    preferredWorkflows: [...(overrides.preferredWorkflows ?? [])],
    fallbackOnlyInWorkflows: [...(overrides.fallbackOnlyInWorkflows ?? [])],
    browserStep: overrides.browserStep,
  };
}

function playwrightBrowserTool(name: string): ToolGovernance {
  const browserStep = name.endsWith("_browser_navigate")
    ? "navigate"
    : name.endsWith("_browser_snapshot")
      ? "snapshot"
      : name.endsWith("_browser_take_screenshot")
        ? "take_screenshot"
        : name.endsWith("_browser_click")
          ? "click"
          : name.endsWith("_browser_type")
            ? "type"
            : "other";

  return buildGovernance("browser", browserStep === "click" || browserStep === "type" ? "state" : "read", browserStep === "click" || browserStep === "type" ? "medium" : "low", {
    source: "mcp",
    browserStep,
    preferredWorkflows: WEB_WORKFLOWS,
  });
}
