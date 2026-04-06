import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { extractMarkdownFromMineruArchive } from "../src/integrations/mineru/archive.js";
import { inspectTextFile } from "../src/tools/fileIntrospection.js";
import { readPdfTool } from "../src/tools/documents/readPdfTool.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

test("inspectTextFile routes pdf files toward read_pdf", async (t) => {
  const root = await createTempWorkspace("pdf-introspection", t);
  const pdfPath = path.join(root, "sample.pdf");
  await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8"));

  const inspected = await inspectTextFile(pdfPath, 1024);
  assert.equal(inspected.readable, false);
  assert.equal(inspected.action, "use_read_pdf");
  assert.equal(inspected.suggestedTool, "read_pdf");
});

test("extractMarkdownFromMineruArchive prefers full.md and falls back to other markdown files", async (t) => {
  const root = await createTempWorkspace("pdf-archive", t);
  const archivePath = path.join(root, "result.zip");
  const zip = new AdmZip();
  zip.addFile("nested/full.md", Buffer.from("# Full Output\n\nHello PDF", "utf8"));
  zip.addFile("nested/layout.json", Buffer.from("{}", "utf8"));
  zip.writeZip(archivePath);

  const extracted = await extractMarkdownFromMineruArchive(archivePath);
  assert.equal(extracted.entryName, "nested/full.md");
  assert.match(extracted.markdown, /Hello PDF/);
});

test("read_pdf fails clearly when MinerU token is missing", async (t) => {
  const root = await createTempWorkspace("pdf-token", t);
  const pdfPath = path.join(root, "sample.pdf");
  await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8"));

  await assert.rejects(
    () =>
      readPdfTool.execute(
        JSON.stringify({ path: pdfPath }),
        makeToolContext(root, root, {
          config: {
            ...createTestRuntimeConfig(root),
            mineru: {
              token: "",
              baseUrl: "https://mineru.net/api/v4",
              modelVersion: "vlm",
              language: "ch",
              enableFormula: true,
              enableTable: true,
              pollIntervalMs: 2000,
              timeoutMs: 300000,
            },
          },
        }) as any,
      ),
    /MINERU_API_TOKEN/i,
  );
});

test("tool registry exposes read_pdf in both agent and read-only modes", () => {
  const agentNames = new Set(createToolRegistry("agent").definitions.map((tool) => tool.function.name));
  const readOnlyNames = new Set(createToolRegistry("read-only").definitions.map((tool) => tool.function.name));

  assert.equal(agentNames.has("read_pdf"), true);
  assert.equal(readOnlyNames.has("read_pdf"), true);
});
