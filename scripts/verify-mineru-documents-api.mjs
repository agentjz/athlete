import fs from "node:fs/promises";
import path from "node:path";

import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";
import { loadProjectContext } from "../.test-build/src/context/projectContext.js";
import { mineruImageReadTool } from "../.test-build/src/tools/documents/mineruImageReadTool.js";
import { mineruPdfReadTool } from "../.test-build/src/tools/documents/mineruPdfReadTool.js";

const IMAGE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Lh6kAAAAASUVORK5CYII=";

async function main() {
  const repoRoot = process.cwd();
  const runtimeConfig = await resolveRuntimeConfig({ cwd: repoRoot, mode: "agent" });
  const smokeDir = path.join(repoRoot, ".tmp-smoke", "mineru-documents");
  const pdfPath = path.join(smokeDir, "mineru-verify.pdf");
  const imagePath = path.join(smokeDir, "mineru-verify.png");

  await fs.mkdir(smokeDir, { recursive: true });
  await fs.writeFile(pdfPath, createMinimalPdf("Hello from Deadmouse MinerU PDF verification."), "binary");
  await fs.writeFile(imagePath, Buffer.from(IMAGE_PNG_BASE64, "base64"));

  const projectContext = await loadProjectContext(repoRoot);
  const pdfResult = await mineruPdfReadTool.execute(
    JSON.stringify({
      path: pdfPath,
      ocr: true,
    }),
    createToolContext(runtimeConfig, repoRoot, projectContext, "verify-mineru-documents-api-pdf"),
  );
  const imageResult = await mineruImageReadTool.execute(
    JSON.stringify({
      path: imagePath,
      ocr: true,
    }),
    createToolContext(runtimeConfig, repoRoot, projectContext, "verify-mineru-documents-api-image"),
  );

  const parsedPdf = JSON.parse(pdfResult.output);
  const parsedImage = JSON.parse(imageResult.output);
  console.log(JSON.stringify({ pdf: parsedPdf, image: parsedImage }, null, 2));

  for (const item of [parsedPdf, parsedImage]) {
    if (!item.batchId || !item.markdownPath) {
      throw new Error("MinerU document verification did not return the expected result shape.");
    }

    const markdown = await fs.readFile(item.markdownPath, "utf8");
    if (!markdown.trim()) {
      throw new Error(`MinerU markdown artifact is empty for ${item.path}.`);
    }
  }
}

function createToolContext(config, cwd, projectContext, sessionId) {
  return {
    config,
    cwd,
    sessionId,
    identity: {
      kind: "lead",
      name: "lead",
    },
    projectContext,
    changeStore: {},
    createToolRegistry: () => ({}),
  };
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
