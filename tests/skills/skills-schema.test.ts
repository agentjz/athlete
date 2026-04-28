import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { parseSkillSource } from "../../src/capabilities/skills/schema.js";

const ROOT = path.join("C:", "repo");

test("parseSkillSource normalizes supported skill metadata into machine-readable fields", () => {
  const skill = parseSkillSource(
    [
      "---",
      "schema_version: skill",
      "name: docx-review",
      "description: Review Word documents with section-aware tools.",
      "version: 1.2.0",
      "agent_kinds: lead, teammate",
      "roles: reviewer",
      "task_types: review, documentation",
      "scenes: docx, word",
      "required_tools: read_docx, edit_docx",
      "optional_tools: search_files",
      "trigger_keywords: review, docx",
      "---",
      "# Docx Review",
      "Use the docx tools and preserve section structure.",
    ].join("\n"),
    {
      absolutePath: path.join(ROOT, "skills", "docx-review", "SKILL.md"),
      rootDir: ROOT,
    },
  );

  assert.equal(skill.schemaVersion, "skill");
  assert.equal(skill.name, "docx-review");
  assert.deepEqual(skill.agentKinds, ["lead", "teammate"]);
  assert.deepEqual(skill.roles, ["reviewer"]);
  assert.deepEqual(skill.taskTypes, ["review", "documentation"]);
  assert.deepEqual(skill.scenes, ["docx", "word"]);
  assert.deepEqual(skill.tools.required, ["read_docx", "edit_docx"]);
  assert.deepEqual(skill.tools.optional, ["search_files"]);
  assert.deepEqual(skill.triggers.keywords, ["review", "docx"]);
  assert.match(skill.body, /preserve section structure/i);
});

test("parseSkillSource rejects invalid metadata with explicit schema failures", () => {
  assert.throws(
    () =>
      parseSkillSource(
        [
          "---",
          "schema_version: skill",
          "description: Missing name",
          "---",
          "Body",
        ].join("\n"),
        {
          absolutePath: path.join(ROOT, "skills", "missing-name", "SKILL.md"),
          rootDir: ROOT,
        },
      ),
    /name/i,
  );

  assert.throws(
    () =>
      parseSkillSource(
        [
          "---",
          "schema_version: skill",
          "name: obsolete-load-mode",
          "description: Obsolete load mode",
          "load_mode: required",
          "---",
          "Body",
        ].join("\n"),
        {
          absolutePath: path.join(ROOT, "skills", "obsolete-load-mode", "SKILL.md"),
          rootDir: ROOT,
        },
      ),
    /load_mode.*obsolete/i,
  );

  assert.throws(
    () =>
      parseSkillSource(
        [
          "---",
          "schema_version: skill",
          "name: obsolete-required",
          "description: Obsolete required flag",
          "required: true",
          "---",
          "Body",
        ].join("\n"),
        {
          absolutePath: path.join(ROOT, "skills", "obsolete-required", "SKILL.md"),
          rootDir: ROOT,
        },
      ),
    /required.*obsolete/i,
  );

  assert.throws(
    () =>
      parseSkillSource(
        [
          "---",
          "schema_version: skill",
          "name: conflicting-tools",
          "description: Tool constraints conflict",
          "required_tools: read_file",
          "incompatible_tools: read_file",
          "---",
          "Body",
        ].join("\n"),
        {
          absolutePath: path.join(ROOT, "skills", "conflicting-tools", "SKILL.md"),
          rootDir: ROOT,
        },
      ),
    /required_tools.*incompatible_tools/i,
  );
});
