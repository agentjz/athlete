import { getBrowserStepRank, getToolGovernanceForName, isBrowserGovernedTool } from "../tools/governance.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ToolRegistryEntry } from "../tools/types.js";

export interface ToolPriorityOptions {
  input?: string;
  objective?: string;
  taskSummary?: string;
  missingRequiredSkillNames?: string[];
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

// Lightweight network tools are preferred first for non-interactive web turns.
const LIGHTWEIGHT_WEB_TOOL_RANK = new Map<string, number>([
  ["http_probe", 0],
  ["http_request", 1],
  ["http_session", 2],
  ["http_suite", 3],
  ["openapi_inspect", 4],
  ["openapi_lint", 5],
  ["download_url", 6],
  ["network_trace", 7],
]);

export function prioritizeToolEntriesForTurn(
  entries: ToolRegistryEntry[],
  options: ToolPriorityOptions,
): ToolRegistryEntry[] {
  if (!shouldPrioritizeBrowserEntries(entries, options)) {
    return entries;
  }

  const missingSkillNames = new Set(
    (options.missingRequiredSkillNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const shouldPreferLoadSkill =
    entries.some((entry) => entry.name === "load_skill") &&
    [...missingSkillNames].some((name) => WEB_WORKFLOW_SKILLS.has(name));
  const interactiveWebIntent = isInteractiveWebIntent(options);

  const prioritized = entries
    .map((entry, index) => ({
      entry,
      index,
      rank: getToolPriorityRank(entry.name, entry.governance, {
        shouldPreferLoadSkill,
        interactiveWebIntent,
      }),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((item) => item.entry);

  return assertSameEntrySet(entries, prioritized);
}

export function prioritizeToolDefinitionsForTurn(
  definitions: FunctionToolDefinition[],
  options: ToolPriorityOptions,
): FunctionToolDefinition[] {
  if (!shouldPrioritizeBrowserTools(definitions, options)) {
    return definitions;
  }

  const missingSkillNames = new Set(
    (options.missingRequiredSkillNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const shouldPreferLoadSkill =
    definitions.some((tool) => tool.function.name === "load_skill") &&
    [...missingSkillNames].some((name) => WEB_WORKFLOW_SKILLS.has(name));
  const interactiveWebIntent = isInteractiveWebIntent(options);

  const prioritized = definitions
    .map((definition, index) => ({
      definition,
      index,
      rank: getToolPriorityRank(
        definition.function.name,
        getToolGovernanceForName(definition.function.name),
        {
          shouldPreferLoadSkill,
          interactiveWebIntent,
        },
      ),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.definition);

  return assertSameDefinitionSet(definitions, prioritized);
}

function assertSameEntrySet(original: ToolRegistryEntry[], prioritized: ToolRegistryEntry[]): ToolRegistryEntry[] {
  assertSameNameSet(
    original.map((entry) => entry.name),
    prioritized.map((entry) => entry.name),
    "tool entry prioritization",
  );
  return prioritized;
}

function assertSameDefinitionSet(original: FunctionToolDefinition[], prioritized: FunctionToolDefinition[]): FunctionToolDefinition[] {
  assertSameNameSet(
    original.map((definition) => definition.function.name),
    prioritized.map((definition) => definition.function.name),
    "tool definition prioritization",
  );
  return prioritized;
}

function assertSameNameSet(originalNames: string[], prioritizedNames: string[], label: string): void {
  const original = [...originalNames].sort();
  const prioritized = [...prioritizedNames].sort();
  if (original.length !== prioritized.length || original.some((name, index) => name !== prioritized[index])) {
    throw new Error(`${label} must not add, remove, or hide tools.`);
  }
}

function shouldPrioritizeBrowserTools(
  definitions: FunctionToolDefinition[],
  options: ToolPriorityOptions,
): boolean {
  return hasBrowserCapabilityTool(definitions) && (hasWebWorkflowSignal(options) || hasExplicitWebSurface(options));
}

function shouldPrioritizeBrowserEntries(
  entries: ToolRegistryEntry[],
  options: ToolPriorityOptions,
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

function hasExplicitWebSurface(options: ToolPriorityOptions): boolean {
  const combinedText = getCombinedText(options);
  if (!combinedText) {
    return false;
  }

  return EXPLICIT_WEB_SURFACE_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function isInteractiveWebIntent(options: ToolPriorityOptions): boolean {
  if (hasInteractiveWebWorkflowSignal(options)) {
    return true;
  }

  const combinedText = getCombinedText(options);
  if (!combinedText) {
    return false;
  }

  return EXPLICIT_INTERACTIVE_WEB_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function hasWebWorkflowSignal(options: ToolPriorityOptions): boolean {
  const activeSkillNames = normalizeSkillNames(options.activeSkillNames);
  const missingRequiredSkillNames = normalizeSkillNames(options.missingRequiredSkillNames);
  return [...activeSkillNames, ...missingRequiredSkillNames].some((name) => WEB_WORKFLOW_SKILLS.has(name));
}

function hasInteractiveWebWorkflowSignal(options: ToolPriorityOptions): boolean {
  const activeSkillNames = normalizeSkillNames(options.activeSkillNames);
  const missingRequiredSkillNames = normalizeSkillNames(options.missingRequiredSkillNames);
  return [...activeSkillNames, ...missingRequiredSkillNames].some((name) =>
    INTERACTIVE_WEB_WORKFLOW_SKILLS.has(name));
}

function normalizeSkillNames(input: string[] | undefined): string[] {
  return (input ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
}

function getCombinedText(options: ToolPriorityOptions): string {
  return [options.input, options.objective, options.taskSummary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}

function getToolPriorityRank(
  name: string,
  governance: ReturnType<typeof getToolGovernanceForName>,
  options: {
    shouldPreferLoadSkill: boolean;
    interactiveWebIntent: boolean;
  },
): number {
  if (options.shouldPreferLoadSkill && name === "load_skill") {
    return 170;
  }

  const lightweightRank = LIGHTWEIGHT_WEB_TOOL_RANK.get(name);
  if (options.interactiveWebIntent) {
    if (governance && isBrowserGovernedTool(governance)) {
      return 80 + getBrowserStepRank(governance);
    }

    if (lightweightRank !== undefined) {
      return 10 + lightweightRank;
    }
  } else {
    if (lightweightRank !== undefined) {
      return 10 + lightweightRank;
    }

    if (governance && isBrowserGovernedTool(governance)) {
      return 60 + getBrowserStepRank(governance);
    }
  }

  if (governance?.specialty === "filesystem" && governance.mutation === "read") {
    return 220;
  }

  if (governance?.fallbackOnlyInWorkflows.some((workflow) => WEB_WORKFLOW_SKILLS.has(workflow))) {
    return 300;
  }

  return 180;
}
