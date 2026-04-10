import { isInternalMessage } from "../agent/taskState.js";
import { getToolGovernanceForName, isBrowserGovernedTool } from "../tools/governance.js";
import type { SessionRecord, StoredMessage, ToolExecutionResult } from "../types.js";
import type { SkillRuntimeState } from "./types.js";

const BROWSER_WORKFLOW_SKILLS = new Set(["web-research", "browser-automation"]);
const WEB_FETCH_PATTERNS = [
  /\bcurl(\.exe)?\b/i,
  /\bwget\b/i,
  /invoke-webrequest/i,
  /news\.google\.com/i,
  /https?:\/\//i,
];

export function getWorkflowToolGateResult(
  toolName: string,
  rawArgs: string,
  session: Pick<SessionRecord, "messages">,
  runtimeState: SkillRuntimeState,
): ToolExecutionResult | null {
  const governance = getToolGovernanceForName(toolName);
  if (!hasLoadedBrowserWorkflow(runtimeState) || !governance || !isWorkflowFallbackTool(governance)) {
    return null;
  }

  const browserState = readBrowserWorkflowState(session.messages);
  if (!browserState.hasBrowserActivity) {
    return buildBlockedWorkflowResult(
      "BROWSER_WORKFLOW_REQUIRED",
      "Use Playwright browser tools before local file inspection or shell-based web fetching.",
      "Start with mcp_playwright_browser_navigate, then inspect the page with mcp_playwright_browser_snapshot.",
      "mcp_playwright_browser_navigate",
    );
  }

  if (!browserState.hasSnapshot && (toolName !== "run_shell" || commandLooksLikeWebFetch(rawArgs))) {
    return buildBlockedWorkflowResult(
      "BROWSER_SNAPSHOT_REQUIRED",
      "Capture the current page state with Playwright before detouring into local files or shell web fetching.",
      "Call mcp_playwright_browser_snapshot next so the agent reads the live page before falling back.",
      "mcp_playwright_browser_snapshot",
    );
  }

  if ((toolName === "run_shell" || toolName === "background_run") && commandLooksLikeWebFetch(rawArgs)) {
    return buildBlockedWorkflowResult(
      "SHELL_WEB_FALLBACK_BLOCKED",
      "Shell-based web fetching is fallback-only when Playwright browser tools are available.",
      "Keep using mcp_playwright_browser_* tools unless the browser path failed and you clearly explain the fallback.",
      "mcp_playwright_browser_snapshot",
    );
  }

  return null;
}

function hasLoadedBrowserWorkflow(runtimeState: SkillRuntimeState): boolean {
  return [...runtimeState.loadedSkillNames].some((name) => BROWSER_WORKFLOW_SKILLS.has(name));
}

function readBrowserWorkflowState(messages: StoredMessage[]): {
  hasBrowserActivity: boolean;
  hasSnapshot: boolean;
} {
  const anchor = findLatestExternalUserIndex(messages);
  const relevantMessages = anchor >= 0 ? messages.slice(anchor) : messages;
  let hasBrowserActivity = false;
  let hasSnapshot = false;

  for (const message of relevantMessages) {
    if (message.role !== "tool" || typeof message.name !== "string") {
      continue;
    }

    const governance = getToolGovernanceForName(message.name);
    if (!governance || !isBrowserGovernedTool(governance)) {
      continue;
    }

    hasBrowserActivity = true;
    if (governance.browserStep === "snapshot") {
      hasSnapshot = true;
    }
  }

  return {
    hasBrowserActivity,
    hasSnapshot,
  };
}

function findLatestExternalUserIndex(messages: StoredMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role !== "user" || !message.content || isInternalMessage(message.content)) {
      continue;
    }

    return index;
  }

  return -1;
}

function commandLooksLikeWebFetch(rawArgs: string): boolean {
  try {
    const parsed = JSON.parse(rawArgs) as { command?: unknown };
    const command = typeof parsed.command === "string" ? parsed.command : "";
    return WEB_FETCH_PATTERNS.some((pattern) => pattern.test(command));
  } catch {
    return false;
  }
}

function buildBlockedWorkflowResult(
  code: string,
  error: string,
  hint: string,
  suggestedTool: string,
): ToolExecutionResult {
  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        code,
        error,
        hint,
        suggestedTool,
      },
      null,
      2,
    ),
  };
}

function isWorkflowFallbackTool(governance: NonNullable<ReturnType<typeof getToolGovernanceForName>>): boolean {
  return governance.fallbackOnlyInWorkflows.some((name) => BROWSER_WORKFLOW_SKILLS.has(name));
}
