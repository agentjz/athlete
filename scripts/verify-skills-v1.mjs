import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runAgentTurn } from "../.test-build/src/agent/runTurn.js";
import { MemorySessionStore } from "../.test-build/src/agent/sessionStore.js";
import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";
import { loadProjectContext } from "../.test-build/src/context/projectContext.js";
import { buildSkillRuntimeState } from "../.test-build/src/skills/state.js";
import { createToolRegistry } from "../.test-build/src/tools/index.js";

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "athlete-skills-v1-"));
  await writeRequiredSkill(workspace);

  const resolved = await resolveRuntimeConfig({ cwd: process.cwd(), mode: "agent" });
  if (!resolved.apiKey) {
    throw new Error("Missing ATHLETE_API_KEY in .athlete/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    mcp: {
      enabled: false,
      servers: [],
    },
  };
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(workspace);
  const toolCalls = [];
  const statusUpdates = [];
  const initialProjectContext = await loadProjectContext(workspace);
  const initialRuntime = buildSkillRuntimeState({
    skills: initialProjectContext.skills,
    session,
    input: "Please outline how to review a proposal.docx safely without editing files yet.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: session.taskState?.objective,
    taskSummary: "[>] docx review task",
    availableToolNames: ["load_skill", "todo_write"],
  });

  const result = await runAgentTurn({
    input: "Please outline how to review a proposal.docx safely without editing files yet.",
    cwd: workspace,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry("agent", {
      onlyNames: ["load_skill", "todo_write"],
    }),
    callbacks: {
      onToolCall(name) {
        toolCalls.push(name);
      },
      onStatus(text) {
        statusUpdates.push(text);
      },
    },
  });

  const projectContext = await loadProjectContext(workspace);
  const runtime = buildSkillRuntimeState({
    skills: projectContext.skills,
    session: result.session,
    input: "Continue the same docx review task.",
    identity: {
      kind: "lead",
      name: "lead",
    },
    objective: result.session.taskState?.objective,
    taskSummary: "[>] docx review task",
    availableToolNames: ["load_skill", "todo_write"],
  });
  const requiredReminderSeen = result.session.messages.some(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.includes("Required skill(s) not loaded:"),
  );

  const summary = {
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    initialApplicableSkills: initialRuntime.applicableSkills.map((skill) => skill.name),
    initialMissingRequiredSkills: initialRuntime.missingRequiredSkills.map((skill) => skill.name),
    toolCalls,
    requiredReminderSeen,
    loadedSkillNames: [...runtime.loadedSkillNames],
    missingRequiredSkills: runtime.missingRequiredSkills.map((skill) => skill.name),
    loadSkillToolMessageCount: result.session.messages.filter(
      (message) => message.role === "tool" && message.name === "load_skill",
    ).length,
    statusUpdates,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!toolCalls.includes("load_skill")) {
    throw new Error("Real API run finished without triggering load_skill.");
  }

  if (!runtime.loadedSkillNames.has("docx-review-required")) {
    throw new Error("Required skill was not recognized as loaded after the real API run.");
  }
}

async function writeRequiredSkill(root) {
  const skillDir = path.join(root, "skills", "docx-review-required");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill.v1",
      "name: docx-review-required",
      "description: Load this before planning any docx review workflow.",
      "version: 1.0.0",
      "load_mode: required",
      "agent_kinds: lead",
      "task_types: review, documentation",
      "scenes: docx",
      "trigger_keywords: review, docx, proposal",
      "---",
      "# Required Docx Review",
      "",
      "1. Confirm that the task is a docx review workflow.",
      "2. Do not invent shell or raw text parsing steps for .docx files.",
      "3. Outline the review workflow before editing anything.",
    ].join("\n"),
    "utf8",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
