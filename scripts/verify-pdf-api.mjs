import fs from "node:fs/promises";
import path from "node:path";

import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";
import { loadProjectContext } from "../.test-build/src/context/projectContext.js";
import { readPdfTool } from "../.test-build/src/tools/documents/readPdfTool.js";

async function main() {
  const repoRoot = process.cwd();
  const runtimeConfig = await resolveRuntimeConfig({ cwd: repoRoot, mode: "agent" });
  const pdfDir = path.join(repoRoot, ".tmp-smoke");
  const pdfPath = path.join(pdfDir, "mineru-verify.pdf");

  await fs.mkdir(pdfDir, { recursive: true });
  await fs.writeFile(pdfPath, createMinimalPdf("Hello from Athlete MinerU verification."), "binary");

  const projectContext = await loadProjectContext(repoRoot);
  const result = await readPdfTool.execute(
    JSON.stringify({
      path: pdfPath,
      ocr: true,
    }),
    {
      config: runtimeConfig,
      cwd: repoRoot,
      sessionId: "verify-pdf-api",
      identity: {
        kind: "lead",
        name: "lead",
      },
      projectContext,
      changeStore: {},
      createToolRegistry: () => ({}),
    },
  );

  const parsed = JSON.parse(result.output);
  console.log(JSON.stringify(parsed, null, 2));

  if (!parsed.batchId || !parsed.markdownPath) {
    throw new Error("read_pdf did not return the expected MinerU result shape.");
  }

  const markdown = await fs.readFile(parsed.markdownPath, "utf8");
  if (!markdown.trim()) {
    throw new Error("MinerU markdown artifact is empty.");
  }
}

function createMinimalPdf(text) {
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  const stream = `BT\n/F1 14 Tf\n36 96 Td\n(${escapePdfText(text)}) Tj\nET`;
  addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return body;
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
