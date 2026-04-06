import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { discoverSkills } from "../src/skills/discovery.js";
import { selectSkillsForTurn } from "../src/skills/matching.js";
import { createTempWorkspace } from "./helpers.js";

test("pdf-reading skill is discoverable and matches PDF workflows", async (t) => {
  const root = await createTempWorkspace("pdf-skill", t);
  const skillDir = path.join(root, "skills", "pdf-reading");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill.v1",
      "name: pdf-reading",
      "description: Read PDFs through the MinerU-backed read_pdf tool.",
      "load_mode: suggested",
      "agent_kinds: lead, teammate",
      "task_types: review, research, extraction",
      "scenes: pdf",
      "required_tools: read_pdf",
      "trigger_keywords: pdf, paper, scanned",
      "---",
      "# PDF Reading",
      "Use read_pdf instead of read_file for PDF workflows.",
    ].join("\n"),
    "utf8",
  );

  const skills = await discoverSkills(root, root, []);
  const result = selectSkillsForTurn({
    skills,
    input: "Please read this scanned PDF paper and summarize the findings.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: "Research extraction from a PDF paper",
    taskSummary: "[>] review pdf paper",
    availableToolNames: ["load_skill", "read_pdf", "read_file"],
    loadedSkillNames: new Set(),
  });

  assert.deepEqual(result.applicableSkills.map((skill) => skill.name), ["pdf-reading"]);
  assert.deepEqual(result.suggestedSkills.map((skill) => skill.name), ["pdf-reading"]);
});
