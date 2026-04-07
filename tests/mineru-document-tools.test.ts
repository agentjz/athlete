import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { extractMarkdownFromMineruArchive } from "../src/integrations/mineru/archive.js";
import { inspectTextFile } from "../src/tools/fileIntrospection.js";
import { mineruDocReadTool } from "../src/tools/documents/mineruDocReadTool.js";
import { mineruImageReadTool } from "../src/tools/documents/mineruImageReadTool.js";
import { mineruPdfReadTool } from "../src/tools/documents/mineruPdfReadTool.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { writeDocxTool } from "../src/tools/documents/writeDocxTool.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

const IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Lh6kAAAAASUVORK5CYII=";

test("inspectTextFile routes supported documents toward dedicated MinerU tools", async (t) => {
  const root = await createTempWorkspace("mineru-introspection", t);
  const cases = [
    { name: "sample.pdf", action: "use_mineru_pdf_read", suggestedTool: "mineru_pdf_read" },
    { name: "sample.png", action: "use_mineru_image_read", suggestedTool: "mineru_image_read" },
    { name: "sample.doc", action: "use_mineru_doc_read", suggestedTool: "mineru_doc_read" },
    { name: "sample.docx", action: "use_mineru_doc_read", suggestedTool: "mineru_doc_read" },
    { name: "sample.pptx", action: "use_mineru_ppt_read", suggestedTool: "mineru_ppt_read" },
  ] as const;

  for (const item of cases) {
    const filePath = path.join(root, item.name);
    await fs.writeFile(filePath, Buffer.from("placeholder", "utf8"));

    const inspected = await inspectTextFile(filePath, 1024);
    assert.equal(inspected.readable, false);
    assert.equal(inspected.action, item.action);
    assert.equal(inspected.suggestedTool, item.suggestedTool);
  }
});

test("extractMarkdownFromMineruArchive prefers full.md and falls back to other markdown files", async (t) => {
  const root = await createTempWorkspace("mineru-archive", t);
  const archivePath = path.join(root, "result.zip");
  const zip = new AdmZip();
  zip.addFile("nested/full.md", Buffer.from("# Full Output\n\nHello MinerU", "utf8"));
  zip.addFile("nested/layout.json", Buffer.from("{}", "utf8"));
  zip.writeZip(archivePath);

  const extracted = await extractMarkdownFromMineruArchive(archivePath);
  assert.equal(extracted.entryName, "nested/full.md");
  assert.match(extracted.markdown, /Hello MinerU/);
});

test("tool registry exposes MinerU document tools and removes legacy read_pdf", () => {
  const agentNames = new Set(createToolRegistry("agent").definitions.map((tool) => tool.function.name));
  const readOnlyNames = new Set(createToolRegistry("read-only").definitions.map((tool) => tool.function.name));

  for (const name of ["mineru_pdf_read", "mineru_image_read", "mineru_doc_read", "mineru_ppt_read", "read_docx"]) {
    assert.equal(agentNames.has(name), true, `${name} should be exposed in agent mode`);
    assert.equal(readOnlyNames.has(name), true, `${name} should be exposed in read-only mode`);
  }

  assert.equal(agentNames.has("read_pdf"), false);
  assert.equal(readOnlyNames.has("read_pdf"), false);
});

test("mineru_image_read uses MinerU and returns markdown artifacts for supported image files", async (t) => {
  const root = await createTempWorkspace("mineru-image", t);
  const imagePath = path.join(root, "receipt.png");
  await fs.writeFile(imagePath, Buffer.from(IMAGE_PNG_BASE64, "base64"));

  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);

    if (url.endsWith("/file-urls/batch")) {
      return createJsonResponse({
        code: 0,
        data: {
          batch_id: "batch-image",
          file_urls: ["https://upload.example.com/image"],
        },
      });
    }

    if (url === "https://upload.example.com/image") {
      return new Response(null, { status: 200 });
    }

    if (url.endsWith("/extract-results/batch/batch-image")) {
      return createJsonResponse({
        code: 0,
        data: {
          extract_result: [
            {
              file_name: "receipt.png",
              state: "done",
              full_md_url: "https://cdn.example.com/receipt.md",
              extract_progress: {
                extracted_pages: 1,
                total_pages: 1,
              },
            },
          ],
        },
      });
    }

    if (url === "https://cdn.example.com/receipt.md") {
      return new Response("# Receipt\n\nTotal: 10", { status: 200 });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const result = await mineruImageReadTool.execute(
      JSON.stringify({ path: imagePath }),
      makeToolContext(root, root) as any,
    );
    const parsed = JSON.parse(result.output) as Record<string, unknown>;

    assert.equal(parsed.provider, "mineru");
    assert.equal(parsed.format, "image");
    assert.equal(parsed.totalPages, 1);
    assert.match(String(parsed.markdownPreview), /Receipt/);
    assert.equal(requests.some((item) => item.endsWith("/file-urls/batch")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mineru_pdf_read rejects files over 200 MB before contacting MinerU", async (t) => {
  const root = await createTempWorkspace("mineru-size-limit", t);
  const pdfPath = path.join(root, "too-large.pdf");
  await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\n", "utf8"));
  await fs.truncate(pdfPath, 201 * 1024 * 1024);

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run for rejected files");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => mineruPdfReadTool.execute(JSON.stringify({ path: pdfPath }), makeToolContext(root, root) as any),
      /size limit exceeded.*current value.*201(\.0+)? MB.*200 MB/i,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mineru_pdf_read rejects files over 600 pages before contacting MinerU", async (t) => {
  const root = await createTempWorkspace("mineru-page-limit", t);
  const pdfPath = path.join(root, "too-many-pages.pdf");
  await fs.writeFile(
    pdfPath,
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 601 >>\nendobj\n", "utf8"),
  );

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run for rejected files");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => mineruPdfReadTool.execute(JSON.stringify({ path: pdfPath }), makeToolContext(root, root) as any),
      /page limit exceeded.*current value.*601.*600/i,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mineru_doc_read falls back to native read_docx when MinerU token is missing", async (t) => {
  const root = await createTempWorkspace("mineru-docx-fallback-token", t);
  const docxPath = path.join(root, "proposal.docx");
  await writeDocxTool.execute(
    JSON.stringify({
      path: docxPath,
      content: "# Proposal\n\nFallback should still read this paragraph.",
      format: "markdown",
    }),
    makeToolContext(root, root) as any,
  );

  const result = await mineruDocReadTool.execute(
    JSON.stringify({ path: docxPath }),
    makeToolContext(root, root, {
      config: {
        ...createTestRuntimeConfig(root),
        mineru: {
          ...createTestRuntimeConfig(root).mineru,
          token: "",
        },
      },
    }) as any,
  );
  const parsed = JSON.parse(result.output) as Record<string, unknown>;
  const fallback = parsed.fallback as Record<string, unknown>;

  assert.equal(parsed.provider, "native_docx_fallback");
  assert.equal(parsed.format, "docx");
  assert.equal(fallback?.used, true);
  assert.equal(fallback?.trigger, "MINERU_TOKEN_MISSING");
  assert.match(String(parsed.content), /Fallback should still read this paragraph/);
});

test("mineru_doc_read falls back to native read_docx when MinerU requests fail", async (t) => {
  const root = await createTempWorkspace("mineru-docx-fallback-request", t);
  const docxPath = path.join(root, "brief.docx");
  await writeDocxTool.execute(
    JSON.stringify({
      path: docxPath,
      content: "MinerU request failures should still preserve docx reading.",
      format: "plain_text",
    }),
    makeToolContext(root, root) as any,
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => createJsonResponse({ code: 1001, msg: "upstream unavailable" }, 503)) as typeof fetch;

  try {
    const result = await mineruDocReadTool.execute(
      JSON.stringify({ path: docxPath }),
      makeToolContext(root, root) as any,
    );
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    const fallback = parsed.fallback as Record<string, unknown>;

    assert.equal(parsed.provider, "native_docx_fallback");
    assert.equal(fallback?.used, true);
    assert.equal(fallback?.trigger, "MINERU_REQUEST_FAILED");
    assert.match(String(parsed.content), /preserve docx reading/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
