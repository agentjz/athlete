import { getBrowserStepRank, getToolGovernanceForName, isBrowserGovernedTool } from "../capabilities/tools/core/governance.js";
import type { FunctionToolDefinition } from "../capabilities/tools/index.js";
import type { ToolRegistryEntry } from "../capabilities/tools/core/types.js";

export interface CapabilityPresentationInput {
  input?: string;
  objective?: string;
  taskSummary?: string;
  activeSkillNames?: string[];
}

const EXPLICIT_WEB_SURFACE_PATTERNS = [
  /https?:\/\/\S+/i,
  /(?:^|\n)\s*(?:url|web_source|source_url)\s*[:=]\s*\S+/i,
  /\b(?:on|from|via)\s+the\s+web\b/i,
  /\b(?:website|web\s*site|webpage|web\s*page)\b/i,
  /\bbrowser\b/i,
];

const EXPLICIT_INTERACTIVE_WEB_PATTERNS = [
  /(?:^|\n)\s*(?:interactive_web|browser_mode|ui_flow)\s*[:=]\s*(?:true|yes|1)\b/i,
  /\bweb_interactive\s*=\s*(?:true|yes|1)\b/i,
  /\b(?:open|visit|browse|navigate)\b[\s\S]{0,40}\b(?:website|webpage|web\s*page|browser)\b/i,
  /\b(?:click|type|fill|scroll|hover|screenshot|snapshot|ui)\b[\s\S]{0,40}\b(?:browser|page|web)\b/i,
];

const WEB_WORKFLOW_SKILLS = new Set(["web-research", "browser-automation"]);
const INTERACTIVE_WEB_WORKFLOW_SKILLS = new Set(["browser-automation"]);

// Presentation order only: this reduces noise without selecting a tool for Lead.
const WEB_TOOL_PRESENTATION_ORDER = new Map<string, number>([
  ["http_probe", 0],
  ["http_request", 1],
  ["http_session", 2],
  ["http_suite", 3],
  ["openapi_inspect", 4],
  ["openapi_lint", 5],
  ["download_url", 6],
  ["network_trace", 7],
]);

export function orderToolEntriesForLead(
  entries: ToolRegistryEntry[],
  options: CapabilityPresentationInput,
): ToolRegistryEntry[] {
  if (!shouldReorderBrowserEntries(entries, options)) {
    return entries;
  }

  const interactiveWebIntent = isInteractiveWebIntent(options);

  const ordered = entries
    .map((entry, index) => ({
      entry,
      index,
      presentationOrder: getToolPresentationOrder(entry.name, entry.governance, {
        interactiveWebIntent,
      }),
    }))
    .sort((left, right) => {
      if (left.presentationOrder !== right.presentationOrder) {
        return left.presentationOrder - right.presentationOrder;
      }

      return left.index - right.index;
    })
    .map((item) => item.entry);

  return assertSameEntrySet(entries, ordered);
}

export function orderToolDefinitionsForLead(
  definitions: FunctionToolDefinition[],
  options: CapabilityPresentationInput,
): FunctionToolDefinition[] {
  if (!shouldReorderBrowserTools(definitions, options)) {
    return definitions;
  }

  const interactiveWebIntent = isInteractiveWebIntent(options);

  const ordered = definitions
    .map((definition, index) => ({
      definition,
      index,
      presentationOrder: getToolPresentationOrder(
        definition.function.name,
        getToolGovernanceForName(definition.function.name),
        {
          interactiveWebIntent,
        },
      ),
    }))
    .sort((left, right) => {
      if (left.presentationOrder !== right.presentationOrder) {
        return left.presentationOrder - right.presentationOrder;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.definition);

  return assertSameDefinitionSet(definitions, ordered);
}

function assertSameEntrySet(original: ToolRegistryEntry[], ordered: ToolRegistryEntry[]): ToolRegistryEntry[] {
  assertSameNameSet(
    original.map((entry) => entry.name),
    ordered.map((entry) => entry.name),
    "tool entry presentation ordering",
  );
  return ordered;
}

function assertSameDefinitionSet(original: FunctionToolDefinition[], ordered: FunctionToolDefinition[]): FunctionToolDefinition[] {
  assertSameNameSet(
    original.map((definition) => definition.function.name),
    ordered.map((definition) => definition.function.name),
    "tool definition presentation ordering",
  );
  return ordered;
}

function assertSameNameSet(originalNames: string[], orderedNames: string[], label: string): void {
  const original = [...originalNames].sort();
  const ordered = [...orderedNames].sort();
  if (original.length !== ordered.length || original.some((name, index) => name !== ordered[index])) {
    throw new Error(`${label} must not add, remove, or hide tools.`);
  }
}

function shouldReorderBrowserTools(
  definitions: FunctionToolDefinition[],
  options: CapabilityPresentationInput,
): boolean {
  return hasBrowserCapabilityTool(definitions) && (hasWebWorkflowSignal(options) || hasExplicitWebSurface(options));
}

function shouldReorderBrowserEntries(
  entries: ToolRegistryEntry[],
  options: CapabilityPresentationInput,
): boolean {
  return (
    entries.some((entry) => isBrowserGovernedTool(entry.governance)) &&
    (hasWebWorkflowSignal(options) || hasExplicitWebSurface(options))
  );
}

function hasBrowserCapabilityTool(definitions: FunctionToolDefinition[]): boolean {
  return definitions.some((tool) => {
    const governance = getToolGovernanceForName(tool.function.name);
    return governance ? isBrowserGovernedTool(governance) : false;
  });
}

function hasExplicitWebSurface(options: CapabilityPresentationInput): boolean {
  const combinedText = getCombinedText(options);
  if (!combinedText) {
    return false;
  }

  return EXPLICIT_WEB_SURFACE_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function isInteractiveWebIntent(options: CapabilityPresentationInput): boolean {
  if (hasInteractiveWebWorkflowSignal(options)) {
    return true;
  }

  const combinedText = getCombinedText(options);
  if (!combinedText) {
    return false;
  }

  return EXPLICIT_INTERACTIVE_WEB_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function hasWebWorkflowSignal(options: CapabilityPresentationInput): boolean {
  const activeSkillNames = normalizeSkillNames(options.activeSkillNames);
  return activeSkillNames.some((name) => WEB_WORKFLOW_SKILLS.has(name));
}

function hasInteractiveWebWorkflowSignal(options: CapabilityPresentationInput): boolean {
  const activeSkillNames = normalizeSkillNames(options.activeSkillNames);
  return activeSkillNames.some((name) => INTERACTIVE_WEB_WORKFLOW_SKILLS.has(name));
}

function normalizeSkillNames(input: string[] | undefined): string[] {
  return (input ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
}

function getCombinedText(options: CapabilityPresentationInput): string {
  return [options.input, options.objective, options.taskSummary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}

function getToolPresentationOrder(
  name: string,
  governance: ReturnType<typeof getToolGovernanceForName>,
  options: {
    interactiveWebIntent: boolean;
  },
): number {
  const lightweightOrder = WEB_TOOL_PRESENTATION_ORDER.get(name);
  if (options.interactiveWebIntent) {
    if (governance && isBrowserGovernedTool(governance)) {
      return 80 + getBrowserStepRank(governance);
    }

    if (lightweightOrder !== undefined) {
      return 10 + lightweightOrder;
    }
  } else {
    if (lightweightOrder !== undefined) {
      return 10 + lightweightOrder;
    }

    if (governance && isBrowserGovernedTool(governance)) {
      return 60 + getBrowserStepRank(governance);
    }
  }

  if (governance?.specialty === "filesystem" && governance.mutation === "read") {
    return 220;
  }

  if (governance?.secondaryInWorkflows.some((workflow) => WEB_WORKFLOW_SKILLS.has(workflow))) {
    return 300;
  }

  return 180;
}
