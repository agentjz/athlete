import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ToolLoopGuard } from "../src/agent/loopGuard.js";
import { createStoredToolMessage } from "../src/agent/toolResultStorage.js";
import { readFileTool } from "../src/tools/files/readFileTool.js";
import type { ToolCallRecord } from "../src/types.js";
import { createTempWorkspace, makeToolContext } from "./helpers.js";

const LARGE_ARTIFACT_MARKER = "ROUND1-ARTIFACT::" + "Z".repeat(24_000);

test("read_file returns a compact artifact view for externalized tool-result files", async (t) => {
  const root = await createTempWorkspace("tool-artifact-read", t);
  const artifactPath = path.join(root, ".athlete", "tool-results", "session-a", "artifact.json");
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
  assert.match(String(payload.note ?? ""), /Use the summary and preview first/i);
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

test("loop guard blocks repeated identical reads of externalized tool-result artifacts on the second retry", () => {
  const loopGuard = new ToolLoopGuard();
  const toolCall = createReadFileToolCall(".athlete/tool-results/session-a/artifact.json");

  assert.equal(loopGuard.getBlockedResult(toolCall), null);
  assert.equal(loopGuard.getBlockedResult(toolCall), null);

  const blocked = loopGuard.getBlockedResult(toolCall);
  assert.ok(blocked);
  assert.match(String(blocked?.output ?? ""), /Loop guard blocked repeated read_file calls/i);
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

function createReadFileToolCall(targetPath: string): ToolCallRecord {
  return {
    id: "call-1",
    type: "function",
    function: {
      name: "read_file",
      arguments: JSON.stringify({
        path: targetPath,
      }),
    },
  };
}
