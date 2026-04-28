import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createStoredToolMessage } from "../../src/agent/context.js";
import { readFileTool } from "../../src/capabilities/tools/packages/files/readFileTool.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

const LARGE_ARTIFACT_MARKER = "ROUND1-ARTIFACT::" + "Z".repeat(24_000);

test("read_file returns a compact artifact view for externalized tool-result files", async (t) => {
  const root = await createTempWorkspace("tool-artifact-read", t);
  const artifactPath = path.join(root, ".deadmouse", "tool-results", "session-a", "artifact.json");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, buildLargeArtifactOutput(), "utf8");

  const result = await readFileTool.execute(
    JSON.stringify({
      path: path.relative(root, artifactPath),
    }),
    makeToolContext(root, root) as any,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.artifactType, "externalized_tool_result");
  assert.match(String(payload.note ?? ""), /Summary and preview are the compact evidence/i);
  assert.match(String(payload.summary ?? ""), /entries=120/);
  assert.match(String(payload.preview ?? ""), /src\/feature-0\.ts|src\\feature-0\.ts/);
  assert.equal(String(payload.content ?? "").includes("ROUND1-ARTIFACT::"), false);
  assert.ok(String(payload.content ?? "").length < 4_000);

  const storedMessage = await createStoredToolMessage({
    toolCallId: "call-1",
    toolName: "read_file",
    rawOutput: result.output,
    sessionId: "session-a",
    projectContext: {
      stateRootDir: root,
    },
  });

  assert.equal(storedMessage.externalizedToolResult, undefined);
});

function buildLargeArtifactOutput(): string {
  return JSON.stringify(
    {
      ok: true,
      path: "validation/huge-index.txt",
      format: "text",
      content: LARGE_ARTIFACT_MARKER,
      entries: Array.from({ length: 120 }, (_, index) => ({
        path: `src/feature-${index}.ts`,
        type: "file",
      })),
      matches: Array.from({ length: 8 }, (_, index) => ({
        path: `src/feature-${index}.ts`,
        line: index + 1,
        text: `signal-${index + 1}`,
      })),
    },
    null,
    2,
  );
}
