import { getBrowserStepRank, getToolGovernanceForName, isBrowserGovernedTool } from "../tools/governance.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ToolRegistryEntry } from "../tools/types.js";

export interface ToolPriorityOptions {
  input?: string;
  objective?: string;
  taskSummary?: string;
  missingRequiredSkillNames?: string[];
}

const WEB_INTENT_PATTERNS = [
  /\b(web|website|webpage|browser|site|url|online|internet)\b/i,
  /\b(latest news|latest updates|public info|public information|open the page|open the website)\b/i,
  /https?:\/\//i,
  /上网|网上|网页|网站|浏览器|打开网页|打开网站|网页上|网站上|最新公开消息|最新消息/,
];

const WEB_WORKFLOW_SKILLS = new Set(["web-research", "browser-automation"]);

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

  return entries
    .map((entry, index) => ({
      entry,
      index,
      rank: getToolPriorityRank(entry.name, entry.governance, shouldPreferLoadSkill),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((item) => item.entry);
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

  return definitions
    .map((definition, index) => ({
      definition,
      index,
      rank: getToolPriorityRank(
        definition.function.name,
        getToolGovernanceForName(definition.function.name),
        shouldPreferLoadSkill,
      ),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.definition);
}

function shouldPrioritizeBrowserTools(
  definitions: FunctionToolDefinition[],
  options: ToolPriorityOptions,
): boolean {
  return hasPlaywrightBrowserTool(definitions) && matchesWebIntent(options);
}

function shouldPrioritizeBrowserEntries(
  entries: ToolRegistryEntry[],
  options: ToolPriorityOptions,
): boolean {
  return entries.some((entry) => isBrowserGovernedTool(entry.governance)) && matchesWebIntent(options);
}

function hasPlaywrightBrowserTool(definitions: FunctionToolDefinition[]): boolean {
  return definitions.some((tool) => {
    const governance = getToolGovernanceForName(tool.function.name);
    return governance ? isBrowserGovernedTool(governance) : false;
  });
}

function matchesWebIntent(options: ToolPriorityOptions): boolean {
  const combinedText = [options.input, options.objective, options.taskSummary]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();

  if (!combinedText) {
    return false;
  }

  return WEB_INTENT_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function getToolPriorityRank(
  name: string,
  governance: ReturnType<typeof getToolGovernanceForName>,
  shouldPreferLoadSkill: boolean,
): number {
  if (shouldPreferLoadSkill && name === "load_skill") {
    return 0;
  }

  if (governance && isBrowserGovernedTool(governance)) {
    return 10 + getBrowserStepRank(governance);
  }

  if (name === "download_url") {
    return 25;
  }

  if (governance?.specialty === "filesystem" && governance.mutation === "read") {
    return 200;
  }

  if (governance?.fallbackOnlyInWorkflows.some((workflow) => WEB_WORKFLOW_SKILLS.has(workflow))) {
    return 300;
  }

  return 150;
}
