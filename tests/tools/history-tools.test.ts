import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createMessage, SessionStore } from "../../src/agent/session.js";
import { ChangeStore } from "../../src/changes/store.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { appendObservabilityEvent } from "../../src/observability/writer.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import type { StoredMessage } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("history tools expose persisted evidence without automatic prompt memory", async (t) => {
  const root = await createTempWorkspace("history-tools", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const statePaths = getProjectStatePaths(root);
  const session = await sessionStore.create(root);
  const artifactStoragePath = path.join(".deadmouse", "tool-results", session.id, "large-read.json");
  const artifactPath = path.join(root, artifactStoragePath);
  const artifactContent = JSON.stringify({
    ok: true,
    marker: "ARTIFACT-FULL-NEEDLE",
    entries: Array.from({ length: 4 }, (_, index) => ({ path: `src/${index}.ts` })),
  }, null, 2);

  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, artifactContent, "utf8");

  const saved = await sessionStore.save({
    ...session,
    messages: [
      createMessage("user", "current objective with searchable needle"),
      createMessage("assistant", null, {
        toolCalls: [
          {
            id: "tool-call-1",
            type: "function",
            function: {
              name: "read_file",
              arguments: JSON.stringify({ path: "large.json" }),
            },
          },
        ],
      }),
      {
        role: "tool",
        content: JSON.stringify({
          externalized: true,
          storagePath: artifactStoragePath,
          preview: "artifact preview needle",
        }, null, 2),
        name: "read_file",
        tool_call_id: "tool-call-1",
        externalizedToolResult: {
          scope: "project_state_root",
          storagePath: artifactStoragePath,
          byteLength: Buffer.byteLength(artifactContent, "utf8"),
          charLength: artifactContent.length,
          preview: "artifact preview needle",
          sha256: "test-sha",
        },
        createdAt: new Date().toISOString(),
      } satisfies StoredMessage,
      createMessage("assistant", "Final answer with final-output marker."),
    ],
  });

  const change = await new ChangeStore(config.paths.changesDir).record({
    sessionId: saved.id,
    cwd: root,
    toolName: "edit_file",
    summary: "changed file evidence",
    operations: [
      {
        path: path.join(root, "a.txt"),
        kind: "update",
        beforeData: Buffer.from("old"),
        afterData: Buffer.from("new"),
        binary: false,
        preview: "old -> new",
      },
    ],
  });
  await appendObservabilityEvent(root, {
    event: "tool.execution",
    status: "failed",
    sessionId: saved.id,
    toolName: "read_file",
    error: {
      message: "recorded runtime failure",
    },
  });

  const registry = createToolRegistry();
  const context = makeToolContext(root, root, {
    config,
    sessionId: saved.id,
  }) as never;

  const list = JSON.parse((await registry.execute("session_list", "{}", context)).output) as Record<string, unknown>;
  assert.match(JSON.stringify(list), new RegExp(saved.id));
  assert.match(JSON.stringify(list), /Final answer with final-output marker/);

  const read = JSON.parse((await registry.execute(
    "session_read",
    JSON.stringify({ session_id: saved.id, message_index: 2 }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(JSON.stringify(read), /artifact preview needle/);
  assert.match(JSON.stringify(read), /externalizedToolResult/);

  const search = JSON.parse((await registry.execute(
    "session_search",
    JSON.stringify({ query: "searchable needle" }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(JSON.stringify(search), /messageIndex/);

  const finalOutput = JSON.parse((await registry.execute(
    "session_final_output",
    JSON.stringify({ session_id: saved.id }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(JSON.stringify(finalOutput), /Final answer with final-output marker/);

  const artifact = JSON.parse((await registry.execute(
    "tool_artifact_read",
    JSON.stringify({ session_id: saved.id, message_index: 2 }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(String(artifact.content), /ARTIFACT-FULL-NEEDLE/);
  assert.match(String(artifact.absolutePath), new RegExp(escapeRegex(statePaths.toolResultsDir)));

  const eventSearch = JSON.parse((await registry.execute(
    "runtime_event_search",
    JSON.stringify({ session_id: saved.id, tool_name: "read_file" }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(JSON.stringify(eventSearch), /recorded runtime failure/);

  const changeRecord = JSON.parse((await registry.execute(
    "change_record_read",
    JSON.stringify({ change_id: change.id }),
    context,
  )).output) as Record<string, unknown>;
  assert.match(JSON.stringify(changeRecord), /changed file evidence/);
});

test("history tools are governed as read-only capabilities", () => {
  const registry = createToolRegistry();
  const historyNames = [
    "session_list",
    "session_read",
    "session_search",
    "session_final_output",
    "tool_artifact_read",
    "runtime_event_search",
    "change_record_read",
  ];

  for (const name of historyNames) {
    const entry = registry.entries?.find((item) => item.name === name);
    assert.ok(entry, `${name} should be registered`);
    assert.equal(entry.governance.specialty, "history");
    assert.equal(entry.governance.mutation, "read");
    assert.equal(entry.governance.changeSignal, "none");
    assert.equal(entry.governance.verificationSignal, "none");
  }
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
