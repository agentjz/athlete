import type { ToolGovernance } from "./types.js";

export function readTool(
  specialty: ToolGovernance["specialty"],
  overrides: Partial<ToolGovernance> = {},
): ToolGovernance {
  return buildGovernance(specialty, "read", "low", overrides);
}

export function stateTool(
  specialty: ToolGovernance["specialty"],
  overrides: Partial<ToolGovernance> = {},
): ToolGovernance {
  return buildGovernance(specialty, "state", "low", overrides);
}

export function writeTool(
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
  };
}
