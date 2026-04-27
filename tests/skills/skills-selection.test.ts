import assert from "node:assert/strict";
import test from "node:test";

import { selectSkillsForTurn } from "../../src/skills/matching.js";
import type { LoadedSkill } from "../../src/types.js";

function createSkill(overrides: Partial<LoadedSkill> = {}): LoadedSkill {
  return {
    schemaVersion: "skill.v1",
    version: "1.0.0",
    name: "base-skill",
    description: "Base skill",
    path: "skills/base/SKILL.md",
    absolutePath: "/repo/skills/base/SKILL.md",
    body: "# Base",
    loadMode: "suggested",
    agentKinds: [],
    roles: [],
    taskTypes: [],
    scenes: [],
    triggers: {
      keywords: [],
      patterns: [],
    },
    tools: {
      required: [],
      optional: [],
      incompatible: [],
    },
    ...overrides,
  };
}

test("selectSkillsForTurn filters by role, task, scene, tools, and required load mode", () => {
  const result = selectSkillsForTurn({
    skills: [
      createSkill({
        name: "docx-review",
        loadMode: "required",
        agentKinds: ["teammate"],
        roles: ["reviewer"],
        taskTypes: ["review", "documentation"],
        scenes: ["docx"],
        triggers: {
          keywords: ["proposal", "review"],
          patterns: [],
        },
        tools: {
          required: ["read_docx", "edit_docx"],
          optional: ["search_files"],
          incompatible: [],
        },
      }),
      createSkill({
        name: "lead-only",
        agentKinds: ["lead"],
        triggers: {
          keywords: ["proposal"],
          patterns: [],
        },
      }),
      createSkill({
        name: "needs-shell",
        tools: {
          required: ["run_shell"],
          optional: [],
          incompatible: [],
        },
        triggers: {
          keywords: ["proposal"],
          patterns: [],
        },
      }),
    ],
    input: "Please review the proposal.docx and keep the document structure intact.",
    identity: {
      kind: "teammate",
      name: "alpha",
      role: "reviewer",
      teamName: "default",
    },
    objective: "Documentation review for the client proposal",
    taskSummary: "[>] review documentation task",
    availableToolNames: ["load_skill", "read_docx", "edit_docx", "search_files"],
    loadedSkillNames: new Set(),
  });

  assert.deepEqual(result.applicableSkills.map((skill) => skill.name), ["docx-review"]);
  assert.deepEqual(result.missingRequiredSkills.map((skill) => skill.name), ["docx-review"]);

  const roleMismatch = result.matches.find((match) => match.skill.name === "lead-only");
  const toolMismatch = result.matches.find((match) => match.skill.name === "needs-shell");

  assert.deepEqual(roleMismatch?.blockedBy, ["agent_kind"]);
  assert.deepEqual(toolMismatch?.blockedBy, ["required_tools"]);
});

test("selectSkillsForTurn keeps manual skills out of suggestions until explicitly named", () => {
  const result = selectSkillsForTurn({
    skills: [
      createSkill({
        name: "manual-checklist",
        loadMode: "manual",
        triggers: {
          keywords: ["testing"],
          patterns: [],
        },
      }),
    ],
    input: "Use manual-checklist before you start the testing workflow.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: "Prepare a testing plan",
    taskSummary: "No tasks.",
    availableToolNames: ["load_skill", "todo_write"],
    loadedSkillNames: new Set(),
  });

  assert.deepEqual(result.namedSkills.map((skill) => skill.name), ["manual-checklist"]);
  assert.deepEqual(result.applicableSkills.map((skill) => skill.name), []);
});
