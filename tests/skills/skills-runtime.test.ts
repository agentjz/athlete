import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createMessage, createToolMessage } from "../../src/agent/session.js";
import { SessionStore } from "../../src/agent/session.js";
import { createInternalReminder } from "../../src/agent/session.js";
import { discoverSkills } from "../../src/skills/discovery.js";
import { buildSkillRuntimeState, getSkillToolGateResult } from "../../src/skills/state.js";
import { loadSkillTool } from "../../src/tools/skills/loadSkillTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

async function writeSkill(root: string): Promise<void> {
  const skillDir = path.join(root, "skills", "docx-review");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill.v1",
      "name: docx-review",
      "description: Review Word documents with section-aware tools.",
      "load_mode: required",
      "agent_kinds: lead",
      "task_types: review, documentation",
      "scenes: docx",
      "required_tools: read_docx, edit_docx",
      "trigger_keywords: review, docx",
      "---",
      "# Docx Review",
      "Use docx-native tools and preserve section structure.",
    ].join("\n"),
    "utf8",
  );
}

test("load_skill output remains recognizable across later turns through the session", async (t) => {
  const root = await createTempWorkspace("skill-runtime", t);
  await writeSkill(root);
  const skills = await discoverSkills(root, root, []);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  let session = await sessionStore.create(root);
  session = await sessionStore.appendMessages(session, [
    createMessage("user", "Please review this proposal.docx carefully."),
  ]);

  const result = await loadSkillTool.execute(
    JSON.stringify({ name: "docx-review" }),
    makeToolContext(root, root, {
      projectContext: {
        rootDir: root,
        stateRootDir: root,
        cwd: root,
        instructions: [],
        instructionText: "",
        instructionTruncated: false,
        skills,
        ignoreRules: [],
      },
    }) as any,
  );

  assert.equal(result.ok, true);
  assert.match(result.output, /"schemaVersion": "skill\.v1"/);

  session = await sessionStore.appendMessages(session, [
    createToolMessage("call-1", result.output, "load_skill"),
    createMessage("user", createInternalReminder("Resume the current task from the latest progress.")),
  ]);

  const reloaded = await sessionStore.load(session.id);
  const runtime = buildSkillRuntimeState({
    skills,
    session: reloaded,
    input: "[internal] Resume the current task from the latest progress.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: "Documentation review for proposal.docx",
    taskSummary: "[>] review documentation task",
    availableToolNames: ["load_skill", "read_docx", "edit_docx"],
  });

  assert.deepEqual(runtime.loadedSkills.map((skill) => skill.name), ["docx-review"]);
  assert.deepEqual(runtime.missingRequiredSkills, []);
});

test("getSkillToolGateResult keeps missing required skills advisory so tools can still run", async (t) => {
  const root = await createTempWorkspace("skill-gate", t);
  await writeSkill(root);
  const skills = await discoverSkills(root, root, []);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.appendMessages(await sessionStore.create(root), [
    createMessage("user", "Please review and update this proposal.docx."),
  ]);

  const runtime = buildSkillRuntimeState({
    skills,
    session,
    input: "Please review and update this proposal.docx.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: "Documentation review for proposal.docx",
    taskSummary: "[>] review documentation task",
    availableToolNames: ["load_skill", "read_docx", "edit_docx", "write_file"],
  });

  assert.equal(getSkillToolGateResult("write_file", runtime), null);
  assert.equal(getSkillToolGateResult("load_skill", runtime), null);
});
