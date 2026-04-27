import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { evaluateAcceptanceState } from "../../src/agent/acceptance.js";
import { createMessage, createToolMessage, MemorySessionStore } from "../../src/agent/session.js";
import { createTempWorkspace } from "../helpers.js";

function createDocumentPrompt(): string {
  return [
    "Analyze the public long document and produce the evidence pack.",
    "<acceptance_contract>",
    JSON.stringify(
      {
        kind: "document",
        required_files: [
          { path: "source/document.pdf", role: "source" },
          { path: "report/summary.md", format: "text", must_contain: ["evidence"] },
          { path: "report/section-index.json", format: "json", min_items: 1 },
          { path: "report/key-points.json", format: "json", min_items: 1, required_record_fields: ["section", "page", "evidence_excerpt"] },
          { path: "report/evidence-map.md", format: "text", must_contain: ["page"] },
          { path: "RESULT.md", format: "text", must_contain: ["document"] },
        ],
      },
      null,
      2,
    ),
    "</acceptance_contract>",
  ].join("\n");
}

test("document acceptance phase advances after a generic document-read completion signal instead of a MinerU tool name", async (t) => {
  const root = await createTempWorkspace("document-workflow-abstraction", t);
  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    messages: [createMessage("user", createDocumentPrompt())],
  });

  await fs.mkdir(path.join(root, "source"), { recursive: true });
  await fs.writeFile(path.join(root, "source", "document.pdf"), Buffer.from("%PDF-1.4\n", "utf8"));

  const afterDownload = await evaluateAcceptanceState({
    session,
    cwd: root,
  });
  assert.equal(afterDownload.state.currentPhase, "read_document");

  const readSession = await sessionStore.save({
    ...afterDownload.session,
    messages: [
      ...afterDownload.session.messages,
      createToolMessage(
        "call-doc",
        JSON.stringify(
          {
            ok: true,
            provider: "alt-document-engine",
            documentKind: "pdf",
            signals: [
              {
                kind: "document_read_completed",
                documentKind: "pdf",
                path: path.join(root, "source", "document.pdf"),
              },
            ],
          },
          null,
          2,
        ),
        "alt_document_reader",
      ),
    ],
  });

  const afterRead = await evaluateAcceptanceState({
    session: readSession,
    cwd: root,
  });
  assert.equal(afterRead.state.currentPhase, "assemble_outputs");
});
