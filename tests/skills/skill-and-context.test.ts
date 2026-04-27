import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildRequestContext } from "../../src/agent/context.js";
import { createMessage } from "../../src/agent/session.js";
import { discoverSkills } from "../../src/skills/catalog.js";
import { loadSkillTool } from "../../src/tools/skills/loadSkillTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("discoverSkills + load_skill load skill bodies on demand", async (t) => {
  const root = await createTempWorkspace("skills", t);
  const skillDir = path.join(root, "skills", "demo-skill");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill.v1",
      "name: demo-skill",
      "description: Demo skill for tests",
      "load_mode: required",
      "trigger_keywords: demo,skill",
      "---",
      "# Demo Skill",
      "Use this specialized workflow.",
    ].join("\n"),
    "utf8",
  );

  const skills = await discoverSkills(root, root, []);
  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.name, "demo-skill");
  assert.equal(skills[0]?.loadMode, "required");

  const output = await loadSkillTool.execute(
    JSON.stringify({ name: "demo-skill" }),
    makeToolContext(root, root, {
      projectContext: {
        stateRootDir: root,
        skills,
      },
    }) as any,
  );

  assert.equal(output.ok, true);
  assert.match(output.output, /"name": "demo-skill"/);
  assert.match(output.output, /Use this specialized workflow\./);
});

test("buildRequestContext compresses oversized histories with a summary", () => {
  const messages = [
    createMessage("user", "current objective"),
    ...Array.from({ length: 39 }, (_, index) => {
      const body = `${index} `.repeat(300);
      return createMessage("assistant", `assistant-${body}`);
    }),
  ];

  const built = buildRequestContext("system", messages, {
    contextWindowMessages: 30,
    model: "deepseek-v4-flash",
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  });

  assert.equal(built.compressed, true);
  assert.ok(built.summary);
  assert.ok(built.messages.length < messages.length + 1);
  assert.ok(built.estimatedChars > 0);
});

test("buildRequestContext keeps the latest tool boundary intact when histories are compressed", () => {
  const messages = [
    createMessage("user", `current objective ${"x".repeat(600)}`),
    ...Array.from({ length: 24 }, (_, index) =>
      index % 2 === 0
        ? createMessage("assistant", null, {
            toolCalls: [
              {
                id: `tool-${index}`,
                type: "function",
                function: {
                  name: "task_list",
                  arguments: "{}",
                },
              },
            ],
          })
        : createMessage("tool", JSON.stringify({ ok: true, preview: "compressed" }), {
            name: "task_list",
          })),
  ];

  const built = buildRequestContext("system", messages, {
    contextWindowMessages: 18,
    model: "deepseek-v4-flash",
    maxContextChars: 6_000,
    contextSummaryChars: 900,
  });

  assert.equal(built.compressed, true);
  assert.equal(built.messages.at(-1)?.role, "tool");
  assert.equal(built.messages.at(-2)?.role, "assistant");
});

test("buildRequestContext preserves DeepSeek V4 reasoning_content only for tool-using turns", () => {
  const toolCallingAssistant = createMessage("assistant", null, {
    reasoningContent: "I need the file list before answering.",
    toolCalls: [
      {
        id: "tool-call-1",
        type: "function",
        function: {
          name: "list_files",
          arguments: "{}",
        },
      },
    ],
  });
  const postToolAssistant = createMessage("assistant", "The tool result is enough.", {
    reasoningContent: "I can answer after the tool result.",
  });
  const ordinaryAssistant = createMessage("assistant", "No tool needed.", {
    reasoningContent: "This ordinary reasoning should not be replayed.",
  });

  const built = buildRequestContext("system", [
    createMessage("user", "Inspect the repo."),
    toolCallingAssistant,
    createMessage("tool", JSON.stringify({ files: ["README.md"] }), {
      name: "list_files",
    }),
    postToolAssistant,
    ordinaryAssistant,
  ], {
    contextWindowMessages: 30,
    model: "deepseek-v4-flash",
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  });

  const replayedToolAssistant = built.messages.find((message) => message.toolCalls?.length);
  const replayedPostToolAssistant = built.messages.find((message) => message.content === "The tool result is enough.");
  const replayedOrdinaryAssistant = built.messages.find((message) => message.content === "No tool needed.");

  assert.equal(replayedToolAssistant?.reasoningContent, "I need the file list before answering.");
  assert.equal(replayedPostToolAssistant?.reasoningContent, "I can answer after the tool result.");
  assert.equal(replayedOrdinaryAssistant?.reasoningContent, undefined);
});

test("buildRequestContext keeps DeepSeek reasoning_content for included post-tool assistant replies", () => {
  const built = buildRequestContext("system", [
    createMessage("user", "Run the tool."),
    createMessage("assistant", null, {
      reasoningContent: "I will call the tool.",
      toolCalls: [
        {
          id: "tool-call-1",
          type: "function",
          function: {
            name: "read_file",
            arguments: "{}",
          },
        },
      ],
    }),
    createMessage("tool", JSON.stringify({ ok: true }), {
      name: "read_file",
    }),
    createMessage("assistant", "The tool is done.", {
      reasoningContent: "I can now summarize the result.",
    }),
    createMessage("user", "[internal] Continue because todo is still open."),
  ], {
    contextWindowMessages: 30,
    model: "deepseek-v4-flash",
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  });

  const finalAssistant = built.messages.find((message) => message.content === "The tool is done.");
  assert.equal(finalAssistant?.reasoningContent, "I can now summarize the result.");
});

test("buildRequestContext summarizes recent context without pinning the first stale user request", () => {
  const messages = [
    createMessage("user", `old objective ${"A".repeat(1_000)}`),
    createMessage("assistant", `old answer ${"B".repeat(1_000)}`),
    createMessage("user", `current objective ${"C".repeat(1_000)}`),
    createMessage("assistant", `current answer ${"D".repeat(1_000)}`),
    ...Array.from({ length: 12 }, (_, index) =>
      createMessage("assistant", `recent assistant ${index} ${"F".repeat(900)}`),
    ),
  ];

  const built = buildRequestContext("system", messages, {
    contextWindowMessages: 4,
    model: "deepseek-v4-flash",
    maxContextChars: 8_500,
    contextSummaryChars: 1_200,
  });

  assert.equal(built.compressed, true);
  assert.doesNotMatch(built.summary ?? "", /old objective/);
  assert.match(built.summary ?? "", /current objective|recent assistant/);
});

test("buildRequestContext does not carry the previous user frame into a new objective prompt", () => {
  const built = buildRequestContext("system", [
    createMessage("user", "old objective: browse Wikipedia"),
    createMessage("assistant", "old answer: Wikipedia report"),
    createMessage("user", "current objective: close all teammates"),
  ], {
    contextWindowMessages: 30,
    model: "deepseek-v4-flash",
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  });

  const requestText = JSON.stringify(built.messages);
  assert.match(requestText, /current objective: close all teammates/);
  assert.doesNotMatch(requestText, /old objective: browse Wikipedia/);
  assert.doesNotMatch(requestText, /old answer: Wikipedia report/);
});
