import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { handleCompletedAssistantResponse } from "../src/agent/turn.js";
import { evaluateAcceptanceState, shouldForceAcceptanceRouteChange } from "../src/agent/acceptance.js";
import { createMessage, createToolMessage, MemorySessionStore } from "../src/agent/session.js";
import type { RunTurnOptions } from "../src/agent/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

function createResearchPrompt(): string {
  return [
    "Build the requested research system.",
    "<acceptance_contract>",
    JSON.stringify(
      {
        kind: "research",
        required_files: [
          {
            path: "backend/news.json",
            format: "json",
            min_items: 2,
            required_record_fields: [
              "title",
              "date",
              "source_name",
              "source_type",
              "link",
              "summary",
              "category",
              "evidence_excerpt",
              "fetched_at",
            ],
          },
          { path: "backend/server.js", format: "text", must_contain: ["news"] },
          { path: "frontend/index.html", format: "text", must_contain: ["news"] },
          { path: "frontend/app.js", format: "text", must_contain: ["fetch"] },
          { path: "RUN.md", format: "text", must_contain: ["node"] },
          { path: "RESULT.md", format: "text", must_contain: ["evidence"] },
        ],
        http_checks: [
          {
            id: "api-news",
            url: "http://127.0.0.1:4010/api/news",
            status: 200,
            body_contains: ["source_name", "evidence_excerpt"],
          },
        ],
      },
      null,
      2,
    ),
    "</acceptance_contract>",
  ].join("\n");
}

test("acceptance evaluation blocks research closeout when evidence-bound JSON fields are missing", async (t) => {
  const root = await createTempWorkspace("acceptance-research-missing-evidence", t);
  await fs.mkdir(path.join(root, "backend"), { recursive: true });
  await fs.writeFile(
    path.join(root, "backend", "news.json"),
    JSON.stringify(
      [
        {
          title: "Patch notes",
          date: "2026-04-10",
          source_name: "Example",
          source_type: "news",
          link: "https://example.com/news",
          summary: "Missing evidence fields",
          category: "patch",
        },
      ],
      null,
      2,
    ),
    "utf8",
  );

  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    messages: [createMessage("user", createResearchPrompt())],
  });

  const evaluation = await evaluateAcceptanceState({
    session,
    cwd: root,
  });

  assert.equal(evaluation.state.currentPhase, "bind_evidence");
  assert.match(evaluation.summary, /evidence_excerpt/);
  assert.match(evaluation.summary, /fetched_at/);

  const outcome = await handleCompletedAssistantResponse({
    session: evaluation.session,
    response: {
      content: "Finished the research system.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([path.join(root, "backend", "news.json")]),
    hadIncompleteTodosAtStart: false,
    hasSubstantiveToolActivity: true,
    verificationState: evaluation.session.verificationState,
    validationReminderInjected: false,
    acceptanceState: evaluation.state,
    options: {
      input: "Finish the task",
      cwd: root,
      config: createTestRuntimeConfig(root),
      session: evaluation.session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "continue");
  if (outcome.kind === "continue") {
    assert.equal(outcome.transition.reason.code, "continue.acceptance_required");
  }
});

test("acceptance evaluation allows finalize only after required files, evidence fields, and probe checks are satisfied", async (t) => {
  const root = await createTempWorkspace("acceptance-research-pass", t);
  await fs.mkdir(path.join(root, "backend"), { recursive: true });
  await fs.mkdir(path.join(root, "frontend"), { recursive: true });

  await fs.writeFile(
    path.join(root, "backend", "news.json"),
    JSON.stringify(
      [
        {
          title: "Patch notes",
          date: "2026-04-10",
          source_name: "Arrowhead",
          source_type: "official",
          link: "https://example.com/official",
          summary: "Official update",
          category: "official",
          evidence_excerpt: "Official excerpt",
          fetched_at: "2026-04-10T10:00:00.000Z",
        },
        {
          title: "News recap",
          date: "2026-04-10",
          source_name: "IGN",
          source_type: "news",
          link: "https://example.com/news",
          summary: "News update",
          category: "news",
          evidence_excerpt: "News excerpt",
          fetched_at: "2026-04-10T10:05:00.000Z",
        },
      ],
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(root, "backend", "server.js"), "export const news = [];\n", "utf8");
  await fs.writeFile(path.join(root, "frontend", "index.html"), "<div>news</div>\n", "utf8");
  await fs.writeFile(path.join(root, "frontend", "app.js"), "fetch('/api/news');\n", "utf8");
  await fs.writeFile(path.join(root, "RUN.md"), "node backend/server.js\n", "utf8");
  await fs.writeFile(path.join(root, "RESULT.md"), "evidence complete\n", "utf8");

  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    messages: [
      createMessage("user", createResearchPrompt()),
      createToolMessage(
        "call-http",
        JSON.stringify(
          {
            ok: true,
            url: "http://127.0.0.1:4010/api/news",
            status: 200,
            body: '[{"source_name":"Arrowhead","evidence_excerpt":"Official excerpt"}]',
          },
          null,
          2,
        ),
        "http_probe",
      ),
    ],
  });

  const evaluation = await evaluateAcceptanceState({
    session,
    cwd: root,
  });

  assert.equal(evaluation.state.currentPhase, "complete");

  const outcome = await handleCompletedAssistantResponse({
    session: evaluation.session,
    response: {
      content: "Finished the research system.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([path.join(root, "backend", "news.json")]),
    hadIncompleteTodosAtStart: false,
    hasSubstantiveToolActivity: true,
    verificationState: evaluation.session.verificationState,
    validationReminderInjected: false,
    acceptanceState: evaluation.state,
    options: {
      input: "Finish the task",
      cwd: root,
      config: createTestRuntimeConfig(root),
      session: evaluation.session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "return");
  if (outcome.kind === "return") {
    assert.equal(outcome.result.transition?.reason.code, "finalize.completed");
  }
});

test("acceptance route-change guard trips after repeated no-progress evaluations in the same phase", () => {
  const stalled = {
    status: "active",
    currentPhase: "bind_evidence",
    stalledPhaseCount: 3,
    completedChecks: ["file:backend/news.json"],
    pendingChecks: ["json_fields:backend/news.json"],
    updatedAt: new Date().toISOString(),
  };

  assert.equal(shouldForceAcceptanceRouteChange(stalled as never), true);
});

