import assert from "node:assert/strict";
import test from "node:test";

import { createMessage, createToolMessage } from "../src/agent/session.js";
import { getWorkflowToolGateResult } from "../src/skills/workflowGuards.js";
import type { SkillRuntimeState } from "../src/types.js";

function createRuntimeState(loadedSkillNames: string[]): SkillRuntimeState {
  return {
    matches: [],
    namedSkills: [],
    applicableSkills: [],
    suggestedSkills: [],
    requiredSkills: [],
    missingRequiredSkills: [],
    loadedSkills: [],
    loadedSkillNames: new Set(loadedSkillNames),
  };
}

test("workflow guard does not block shell web fetching before Playwright browser navigation starts", () => {
  const blocked = getWorkflowToolGateResult(
    "run_shell",
    JSON.stringify({ command: "curl.exe -L https://example.com -o page.html" }),
    {
      messages: [createMessage("user", "Please research the latest public Helldivers 2 news on the web.")],
    },
    createRuntimeState(["web-research"]),
  );

  assert.equal(blocked, null);
});

test("workflow guard does not block shell web fetching before a Playwright snapshot is captured", () => {
  const blocked = getWorkflowToolGateResult(
    "run_shell",
    JSON.stringify({ command: "curl.exe -L https://example.com -o page.html" }),
    {
      messages: [
        createMessage("user", "Please research the latest public Helldivers 2 news on the web."),
        createToolMessage("call-1", "navigated", "mcp_playwright_browser_navigate"),
      ],
    },
    createRuntimeState(["web-research"]),
  );

  assert.equal(blocked, null);
});

test("workflow guard allows file writing after Playwright navigation and snapshot", () => {
  const blocked = getWorkflowToolGateResult(
    "write_file",
    JSON.stringify({ path: "validation/helldivers2-latest.md", content: "summary" }),
    {
      messages: [
        createMessage("user", "Please research the latest public Helldivers 2 news on the web."),
        createToolMessage("call-1", "navigated", "mcp_playwright_browser_navigate"),
        createToolMessage("call-2", "snapshot", "mcp_playwright_browser_snapshot"),
      ],
    },
    createRuntimeState(["web-research"]),
  );

  assert.equal(blocked, null);
});
