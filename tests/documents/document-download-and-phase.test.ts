import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { evaluateAcceptanceState } from "../../src/agent/acceptance.js";
import { createMessage, createToolMessage, MemorySessionStore } from "../../src/agent/session.js";
import { downloadUrlTool } from "../../src/tools/network/downloadUrlTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

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

test("download_url saves remote bytes into the workspace and emits a changed path", async (t) => {
  const root = await createTempWorkspace("download-url", t);
  const payload = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "utf8");

  const server = http.createServer((request, response) => {
    if (request.url !== "/document.pdf") {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": String(payload.length),
    });
    response.end(payload);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/document.pdf`;

  const result = await downloadUrlTool.execute(
    JSON.stringify({
      url,
      path: "source/document.pdf",
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payloadJson = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payloadJson.path, path.join(root, "source", "document.pdf"));
  assert.equal((result.metadata?.changedPaths ?? []).includes("source/document.pdf"), true);
  const stored = await fs.readFile(path.join(root, "source", "document.pdf"));
  assert.deepEqual(stored, payload);
});

test("document acceptance phase advances from acquire_document to read_document to assemble_outputs", async (t) => {
  const root = await createTempWorkspace("document-phase", t);
  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    messages: [createMessage("user", createDocumentPrompt())],
  });

  const beforeDownload = await evaluateAcceptanceState({
    session,
    cwd: root,
  });
  assert.equal(beforeDownload.state.currentPhase, "acquire_document");

  await fs.mkdir(path.join(root, "source"), { recursive: true });
  await fs.writeFile(path.join(root, "source", "document.pdf"), Buffer.from("%PDF-1.4\n", "utf8"));

  const afterDownload = await evaluateAcceptanceState({
    session: beforeDownload.session,
    cwd: root,
  });
  assert.equal(afterDownload.state.currentPhase, "read_document");

  const readSession = await sessionStore.save({
    ...afterDownload.session,
    messages: [
      ...afterDownload.session.messages,
      createToolMessage(
        "call-mineru",
        JSON.stringify(
          {
            ok: true,
            path: path.join(root, "source", "document.pdf"),
            markdownPath: path.join(root, ".deadmouse", "mineru", "batch-1", "full.md"),
          },
          null,
          2,
        ),
        "mineru_pdf_read",
      ),
    ],
  });

  const afterRead = await evaluateAcceptanceState({
    session: readSession,
    cwd: root,
  });
  assert.equal(afterRead.state.currentPhase, "assemble_outputs");
});

