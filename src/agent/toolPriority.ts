import type { FunctionToolDefinition } from "../tools/index.js";

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
const LOCAL_FILE_TOOLS = new Set(["list_files", "read_file", "search_files"]);
const SHELL_FALLBACK_TOOLS = new Set(["run_shell", "background_run"]);

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
      rank: getToolPriorityRank(definition.function.name, shouldPreferLoadSkill),
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

function hasPlaywrightBrowserTool(definitions: FunctionToolDefinition[]): boolean {
  return definitions.some((tool) => isPlaywrightBrowserToolName(tool.function.name));
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

function getToolPriorityRank(name: string, shouldPreferLoadSkill: boolean): number {
  if (shouldPreferLoadSkill && name === "load_skill") {
    return 0;
  }

  if (isPlaywrightBrowserToolName(name)) {
    return 10 + getPlaywrightBrowserToolOrder(name);
  }

  if (LOCAL_FILE_TOOLS.has(name)) {
    return 200;
  }

  if (SHELL_FALLBACK_TOOLS.has(name)) {
    return 300;
  }

  return 150;
}

function getPlaywrightBrowserToolOrder(name: string): number {
  if (name.endsWith("_browser_navigate")) {
    return 0;
  }

  if (name.endsWith("_browser_snapshot")) {
    return 1;
  }

  if (name.endsWith("_browser_take_screenshot")) {
    return 2;
  }

  if (name.endsWith("_browser_click")) {
    return 3;
  }

  if (name.endsWith("_browser_type")) {
    return 4;
  }

  return 20;
}

function isPlaywrightBrowserToolName(name: string): boolean {
  return /^mcp_playwright_browser_/i.test(name);
}
