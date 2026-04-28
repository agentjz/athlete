import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createMessage, createToolMessage } from "../../src/agent/session.js";
import { SessionStore } from "../../src/agent/session.js";
import { createInternalReminder } from "../../src/agent/session.js";
import { discoverSkills } from "../../src/capabilities/skills/discovery.js";
import { buildSkillRuntimeState } from "../../src/capabilities/skills/state.js";
import { loadSkillTool } from "../../src/capabilities/tools/packages/skills/loadSkillTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

async function writeSkill(root: string): Promise<void> {
  const skillDir = path.join(root, "skills", "docx-review");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill",
      "name: docx-review",
      "description: Review Word documents with section-aware tools.",
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
  assert.match(result.output, /"schemaVersion": "skill"/);

  session = await sessionStore.appendMessages(session, [
    createToolMessage("call-1", result.output, "load_skill"),
    createMessage("user", createInternalReminder("Wake lead runtime; runtime state changed.")),
  ]);

  const reloaded = await sessionStore.load(session.id);
  const runtime = buildSkillRuntimeState({
    skills,
    session: reloaded,
  });

  assert.deepEqual(runtime.loadedSkills.map((skill) => skill.name), ["docx-review"]);
  assert.deepEqual([...runtime.loadedSkillNames], ["docx-review"]);
});

test("unloaded matching-looking skills do not become runtime requirements", async (t) => {
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
  });

  assert.deepEqual(runtime.loadedSkills, []);
  assert.deepEqual([...runtime.loadedSkillNames], []);
});
