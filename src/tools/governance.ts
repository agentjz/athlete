import { ToolExecutionError } from "./errors.js";
import { getBuiltinToolGovernance } from "./builtinCatalog.js";
import { browserCapabilityTool, parseBrowserStepFromName } from "./governancePresets.js";
import type {
  RegisteredTool,
  ToolGovernance,
  ToolRegistryBlockedTool,
  ToolRegistryEntry,
} from "./types.js";
import type { ToolExecutionResult } from "../types.js";

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
  if (!tool.governance) {
    if (tool.origin?.kind === "mcp") {
      return {
        blocked: {
          name,
          reason: "Blocked by tool governance: MCP tool is missing safe governance metadata and no trusted readOnly hint was provided.",
          origin: tool.origin,
        },
      };
    }

    throw new Error(`Tool governance metadata is required for ${name}.`);
  }

  return {
    governance: normalizeToolGovernance(name, tool.governance),
  };
}

export function getToolGovernanceForName(name: string): ToolGovernance | null {
  const builtin = getBuiltinToolGovernance(name);
  if (builtin) {
    return builtin;
  }

  const browserStep = parseBrowserStepFromName(name);
  return browserStep ? browserCapabilityTool(browserStep) : null;
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

export function isDocumentReadGovernedTool(
  governance: Pick<ToolGovernance, "specialty" | "mutation">,
): boolean {
  return governance.specialty === "document" && governance.mutation === "read";
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
    documentKind: partial.documentKind,
  };

  if (governance.mutation === "read" && governance.destructive) {
    throw new Error(`Tool governance for ${name} is invalid: read tools cannot be destructive.`);
  }

  if (governance.mutation === "read" && governance.changeSignal !== "none") {
    throw new Error(`Tool governance for ${name} is invalid: read tools cannot require change signals.`);
  }

  return governance;
}

function requireField<T>(name: string, value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Tool governance metadata for ${name} is missing "${field}".`);
  }

  return value;
}
