import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runAgentTurn } from "../.test-build/src/agent/runTurn.js";
import { MemorySessionStore } from "../.test-build/src/agent/session.js";
import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";
import { loadProjectContext } from "../.test-build/src/context/projectContext.js";
import { buildSkillRuntimeState } from "../.test-build/src/capabilities/skills/state.js";
import { createToolRegistry } from "../.test-build/src/capabilities/tools/index.js";

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "deadmouse-skills-"));
  await writeSkill(workspace);

  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing DEADMOUSE_API_KEY in .deadmouse/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    mcp: {
      enabled: false,
      servers: [],
      playwright: resolved.mcp.playwright,
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
  });

  const result = await runAgentTurn({
    input: "Call load_skill for docx-review, then briefly confirm the skill body was loaded. Do not review the document yet.",
    cwd: workspace,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: ["load_skill"],
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
  });
  const machineSkillReminderSeen = result.session.messages.some(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.startsWith("[internal]") &&
      /skill\(s\)|load skill|required skill/i.test(message.content),
  );

  const summary = {
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    initialLoadedSkillNames: [...initialRuntime.loadedSkillNames],
    toolCalls,
    machineSkillReminderSeen,
    loadedSkillNames: [...runtime.loadedSkillNames],
    loadSkillToolMessageCount: result.session.messages.filter(
      (message) => message.role === "tool" && message.name === "load_skill",
    ).length,
    statusUpdates,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!toolCalls.includes("load_skill")) {
    throw new Error("Real API run finished without triggering load_skill.");
  }

  if (machineSkillReminderSeen) {
    throw new Error("Machine-injected skill reminder appeared in the real API run.");
  }

  if (!runtime.loadedSkillNames.has("docx-review")) {
    throw new Error("Explicitly loaded skill was not recognized after the real API run.");
  }
}

async function writeSkill(root) {
  const skillDir = path.join(root, "skills", "docx-review");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill",
      "name: docx-review",
      "description: Skill body for docx review workflow planning.",
      "version: 1.0.0",
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
