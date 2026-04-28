import type {
  ToolGovernance,
  ToolGovernanceBrowserStep,
  ToolGovernanceDocumentKind,
} from "./types.js";

export const WEB_WORKFLOWS = ["web-research", "browser-automation"] as const;

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

export function documentReadTool(documentKind: ToolGovernanceDocumentKind): ToolGovernance {
  return readTool("document", {
    concurrencySafe: true,
    documentKind,
  });
}

export function browserCapabilityTool(browserStep: ToolGovernanceBrowserStep): ToolGovernance {
  const stateful = browserStep === "click" || browserStep === "type";
  return buildGovernance("browser", stateful ? "state" : "read", stateful ? "medium" : "low", {
    source: "mcp",
    browserStep,
    preferredWorkflows: WEB_WORKFLOWS,
  });
}

export function parseBrowserStepFromName(name: string): ToolGovernanceBrowserStep | null {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("browser_navigate")) {
    return "navigate";
  }
  if (normalized.includes("browser_snapshot")) {
    return "snapshot";
  }
  if (normalized.includes("browser_take_screenshot")) {
    return "take_screenshot";
  }
  if (normalized.includes("browser_click")) {
    return "click";
  }
  if (normalized.includes("browser_type")) {
    return "type";
  }
  if (normalized.includes("browser_")) {
    return "other";
  }

  return null;
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
    secondaryInWorkflows: [...(overrides.secondaryInWorkflows ?? [])],
    browserStep: overrides.browserStep,
    documentKind: overrides.documentKind,
  };
}
