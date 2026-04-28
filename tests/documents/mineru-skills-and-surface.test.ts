import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildSystemPromptLayers, renderPromptLayers } from "../../src/agent/promptSections.js";
import { executeToolCallWithRecovery } from "../../src/agent/turn.js";
import { discoverSkills } from "../../src/capabilities/skills/discovery.js";
import { createStreamRenderer } from "../../src/ui/streamRenderer.js";
import { createTestRuntimeConfig } from "../helpers.js";

const REPO_ROOT = process.cwd();

test("repo skill catalog contains MinerU document skills and removes the retired pdf-reading skill", async () => {
  const skills = await discoverSkills(REPO_ROOT, REPO_ROOT, []);
  const names = new Set(skills.map((skill) => skill.name));

  assert.equal(names.has("mineru-pdf-reading"), true);
  assert.equal(names.has("mineru-image-reading"), true);
  assert.equal(names.has("mineru-doc-reading"), true);
  assert.equal(names.has("mineru-ppt-reading"), true);
  assert.equal(names.has("pdf-reading"), false);
  await assert.rejects(
    () => fsPromises.stat(path.join(REPO_ROOT, "src", "capabilities", "skills", "packages", "pdf-reading", "SKILL.md")),
    /ENOENT/,
  );
});

test("MinerU skills are discoverable without turn-level auto routing", async () => {
  const skills = await discoverSkills(REPO_ROOT, REPO_ROOT, []);
  const names = new Set(skills.map((skill) => skill.name));

  assert.equal(names.has("mineru-pdf-reading"), true);
  assert.equal(names.has("mineru-image-reading"), true);
  assert.equal(names.has("mineru-doc-reading"), true);
  assert.equal(names.has("mineru-ppt-reading"), true);
});

test("system prompt keeps document routing at the principle level instead of hardcoding the full MinerU route table", () => {
  const root = REPO_ROOT;
  const prompt = renderPromptLayers(
    buildSystemPromptLayers(
      root,
      createTestRuntimeConfig(root),
      {
        rootDir: root,
        stateRootDir: root,
        cwd: root,
        instructions: [],
        instructionText: "",
        instructionTruncated: false,
        skills: [],
        ignoreRules: [],
      },
    ),
  );

  assert.match(prompt, /Browser and document tools are capability surfaces/i);
  assert.match(prompt, /file introspection or tool recovery points to a specialized tool/i);
  assert.match(prompt, /treat that as evidence, not a command/i);
  assert.doesNotMatch(prompt, /\bread_pdf\b/);
  assert.doesNotMatch(prompt, /mineru_doc_read|mineru_pdf_read|mineru_image_read|mineru_ppt_read/);
  assert.doesNotMatch(prompt, /Skip unsupported binary documents such as \.doc and \.pptx/i);
});

test("executeToolCallWithRecovery returns document capability hints for supported document failures", async () => {
  const config = createTestRuntimeConfig(REPO_ROOT);
  const cases = [
    {
      message: "The target is a PDF document (.pdf).",
      expectedHint: /document-read capability/i,
    },
    {
      message: "The target is a PNG image (.png).",
      expectedHint: /document-read capability/i,
    },
    {
      message: "The target is a DOCX document (.docx).",
      expectedHint: /document-read capability/i,
    },
    {
      message: "The target is a PPTX deck (.pptx).",
      expectedHint: /document-read capability/i,
    },
  ] as const;

  for (const item of cases) {
    const result = await executeToolCallWithRecovery(
      {
        definitions: [],
        async execute() {
          throw new Error(item.message);
        },
      },
      {
        id: "call-1",
        type: "function",
        function: {
          name: "read_file",
          arguments: JSON.stringify({ path: "dummy" }),
        },
      },
      {
        config,
        cwd: REPO_ROOT,
        session: {
          id: "session-1",
        },
      } as any,
      {
        id: "session-1",
      } as any,
      {
        rootDir: REPO_ROOT,
        stateRootDir: REPO_ROOT,
        cwd: REPO_ROOT,
        instructions: [],
        instructionText: "",
        instructionTruncated: false,
        skills: [],
        ignoreRules: [],
      },
      {} as any,
    );
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    assert.match(String(parsed.hint), item.expectedHint);
  }
});

test("stream renderer shows MinerU document tool calls with file paths", async () => {
  const output = await captureStdout(async () => {
    const renderer = createStreamRenderer(
      {
        showReasoning: false,
      },
      {
        cwd: REPO_ROOT,
      },
    );

    renderer.callbacks.onToolCall?.(
      "mineru_ppt_read",
      JSON.stringify({
        path: path.join(REPO_ROOT, "docs", "deck.pptx"),
      }),
    );
    renderer.callbacks.onToolResult?.(
      "mineru_ppt_read",
      JSON.stringify({
        path: path.join(REPO_ROOT, "docs", "deck.pptx"),
        markdownPreview: "# Deck",
      }),
    );
  });

  assert.match(output, /mineru_ppt_read/);
  assert.match(output, /docs[\\/]+deck\.pptx/);
  assert.match(output, /\[result\] mineru_ppt_read docs[\\/]+deck\.pptx ok/);
  assert.doesNotMatch(output, /# Deck|\[preview\]/);
});

test("README exposes the MinerU verification command while spec and skills docs describe the document chain", async () => {
  const readme = await fsPromises.readFile(path.join(REPO_ROOT, "README.md"), "utf8");
  const skillsReadme = await fsPromises.readFile(
    path.join(REPO_ROOT, "src", "capabilities", "skills", "packages", "README.md"),
    "utf8",
  );
  const spec = await fsPromises.readFile(
    path.join(REPO_ROOT, "spec", "\u6280\u672f\u5b9e\u73b0", "T04-\u6269\u5c55\u4e0e\u63a5\u5165", "02-\u6269\u5c55\u673a\u5236.md"),
    "utf8",
  );
  const packageJson = JSON.parse(await fsPromises.readFile(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.match(readme, /verify:mineru-documents-api/);
  assert.doesNotMatch(readme, /`read_pdf`/);
  assert.doesNotMatch(readme, /`pdf-reading`/);

  for (const source of [skillsReadme, spec]) {
    assert.match(source, /mineru_pdf_read/);
    assert.match(source, /mineru_doc_read/);
    assert.match(source, /mineru_ppt_read/);
    assert.match(source, /mineru-pdf-reading/);
    assert.doesNotMatch(source, /`read_pdf`/);
    assert.doesNotMatch(source, /`pdf-reading`/);
  }

  assert.equal(typeof packageJson.scripts?.["verify:mineru-documents-api"], "string");
  assert.equal(packageJson.scripts?.["verify:pdf-api"], undefined);
});

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const writes: string[] = [];
  const original = fs.writeSync;
  (fs as typeof fs & { writeSync: typeof fs.writeSync }).writeSync = ((fd, buffer, ...rest) => {
    writes.push(String(buffer));
    return typeof buffer === "string" ? buffer.length : Buffer.byteLength(String(buffer));
  }) as typeof fs.writeSync;

  try {
    await run();
    return writes.join("");
  } finally {
    (fs as typeof fs & { writeSync: typeof fs.writeSync }).writeSync = original;
  }
}
