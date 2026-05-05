import { ToolExecutionError } from "./errors.js";
import { getBuiltinToolGovernance } from "../toolCatalog.js";
import type {
  RegisteredTool,
  ToolGovernance,
  ToolRegistryBlockedTool,
  ToolRegistryEntry,
} from "./types.js";
import type { ToolExecutionResult } from "../../../types.js";

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
    throw new Error(`Tool governance metadata is required for ${name}.`);
  }

  return {
    governance: normalizeToolGovernance(name, tool.governance),
  };
}

export function getToolGovernanceForName(name: string): ToolGovernance | null {
  const builtin = getBuiltinToolGovernance(name);
  if (builtin) {
    return normalizeToolGovernance(name, builtin);
  }

  return null;
}

export function validateToolExecutionResult(
  entry: Pick<ToolRegistryEntry, "name" | "governance">,
  result: ToolExecutionResult,
): ToolExecutionResult {
  if (!result.ok) {
    return result;
  }

  const changedPaths = result.metadata?.changedPaths?.length ?? 0;
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

  return result;
}

function normalizeToolGovernance(name: string, partial: Partial<ToolGovernance>): ToolGovernance {
  const governance: ToolGovernance = {
    source: partial.source ?? "builtin",
    specialty: requireField(name, partial.specialty, "specialty"),
    mutation: requireField(name, partial.mutation, "mutation"),
    risk: requireField(name, partial.risk, "risk"),
    destructive: partial.destructive ?? false,
    concurrencySafe: requireField(name, partial.concurrencySafe, "concurrencySafe"),
    changeSignal: requireField(name, partial.changeSignal, "changeSignal"),
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
