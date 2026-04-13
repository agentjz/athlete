import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildRequestContext } from "../.test-build/src/agent/contextBuilder.js";
import { runManagedAgentTurn } from "../.test-build/src/agent/managedTurn.js";
import { SessionStore } from "../.test-build/src/agent/sessionStore.js";
import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "athlete-runtime-context-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd(), mode: "agent" });
  if (!resolved.apiKey) {
    throw new Error("Missing ATHLETE_API_KEY in .athlete/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    yieldAfterToolSteps: 1,
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  const session = await sessionStore.create(workspace);
  const toolCalls = [];
  const statusUpdates = [];
  let yieldCount = 0;

  const result = await runManagedAgentTurn({
    input: [
      "Validate Athlete runtime lightweight context behavior.",
      "First call emit_large_validation exactly once, and do not call any other tool in the same response.",
      "After the turn resumes, continue from that stored result instead of restarting.",
      "Then call write_validation_note to create validation/runtime-context-summary.md.",
      "The note should mention that the large tool result was externalized, the task continued after resume, and the session stayed on the same task.",
      "Finish with one short sentence after the file is written.",
    ].join(" "),
    cwd: workspace,
    config,
    session,
    sessionStore,
    toolRegistry: createRound1ApiRegistry(workspace),
    identity: {
      kind: "teammate",
      name: "runtime-verifier",
      role: "runtime_context",
      teamName: "verification",
    },
    onYield() {
      yieldCount += 1;
      return {
        input: "[internal] Continue from the current session state and stored tool-result previews. Do not call emit_large_validation again after it succeeds. If the note is already written, finalize instead of repeating work.",
      };
    },
    callbacks: {
      onToolCall(name) {
        toolCalls.push(name);
      },
      onStatus(text) {
        statusUpdates.push(text);
      },
    },
  });

  const reloaded = await sessionStore.load(result.session.id);
  const externalizedToolMessages = reloaded.messages.filter(
    (message) =>
      message.role === "tool" &&
      typeof message.content === "string" &&
      message.content.includes('"externalized": true'),
  );
  const externalizedPayload = externalizedToolMessages[0]?.content
    ? JSON.parse(externalizedToolMessages[0].content)
    : null;
  const storagePath = typeof externalizedPayload?.storagePath === "string"
    ? externalizedPayload.storagePath
    : null;
  const storageFullPath = storagePath ? path.join(workspace, storagePath) : null;
  const summaryPath = path.join(workspace, "validation", "runtime-context-summary.md");
  const summaryText = await fs.readFile(summaryPath, "utf8");
  const requestContext = buildRequestContext("system", reloaded.messages, {
    contextWindowMessages: 12,
    model: config.model,
    maxContextChars: 8_500,
    contextSummaryChars: 1_400,
  });

  const output = {
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: result.session.id,
    yieldCount,
    toolCalls,
    externalizedToolMessages: externalizedToolMessages.length,
    storagePath,
    storageFileExists: storageFullPath ? await exists(storageFullPath) : false,
    summaryPath: path.relative(workspace, summaryPath),
    summaryPreview: summaryText.slice(0, 240),
    requestContextCompressed: requestContext.compressed,
    requestToolPreview: String(requestContext.messages.find((message) => message.role === "tool")?.content ?? "").slice(0, 240),
    statusUpdates,
  };

  console.log(JSON.stringify(output, null, 2));

  if (yieldCount < 1) {
    throw new Error("Real API validation did not trigger continuation after the large tool result.");
  }

  if (!toolCalls.includes("emit_large_validation")) {
    throw new Error("Real API validation finished without calling emit_large_validation.");
  }

  if (!toolCalls.includes("write_validation_note")) {
    throw new Error("Real API validation finished without writing the validation note.");
  }

  if (externalizedToolMessages.length < 1 || !storagePath || !storageFullPath) {
    throw new Error("Large tool result was not externalized into the persisted session.");
  }

  if (!(await exists(storageFullPath))) {
    throw new Error("Externalized tool-result artifact file was not found on disk.");
  }

  if (!summaryText.trim()) {
    throw new Error("Validation note was written, but it is empty.");
  }
}

function createRound1ApiRegistry(workspace) {
  let largeValidationCallCount = 0;

  return {
    definitions: [
      createFunctionTool(
        "emit_large_validation",
        "Required first step. Returns a large structured validation corpus for the runtime lightweight-context check. Call this before writing the note.",
      ),
      createFunctionTool(
        "write_validation_note",
        "Write the final markdown note after you have already reviewed emit_large_validation.",
        {
          path: {
            type: "string",
          },
          content: {
            type: "string",
          },
        },
        ["path", "content"],
      ),
    ],
    async execute(name, rawArgs) {
      const args = rawArgs ? JSON.parse(rawArgs) : {};

      switch (name) {
        case "emit_large_validation":
          largeValidationCallCount += 1;
          return {
            ok: true,
            output: buildLargeValidationPayload(largeValidationCallCount),
          };
        case "write_validation_note": {
          if (largeValidationCallCount < 1) {
            return {
              ok: false,
              output: JSON.stringify(
                {
                  ok: false,
                  error: "emit_large_validation must be called before write_validation_note.",
                },
                null,
                2,
              ),
            };
          }

          const relativePath = String(args.path ?? "validation/runtime-context-summary.md");
          const absolutePath = path.resolve(workspace, relativePath);
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, String(args.content ?? ""), "utf8");
          return {
            ok: true,
            output: JSON.stringify(
              {
                ok: true,
                path: path.relative(workspace, absolutePath) || relativePath,
                preview: String(args.content ?? "").slice(0, 240),
              },
              null,
              2,
            ),
          };
        }
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  };
}

function createFunctionTool(name, description, properties = {}, required = []) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

function buildLargeValidationPayload(callCount) {
  return JSON.stringify(
    {
      ok: true,
      title: "Round1 lightweight validation corpus",
      format: "markdown",
      callCount,
      content: "ROUND1-REAL-API::" + "L".repeat(24_000),
      entries: Array.from({ length: 80 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        type: "file",
      })),
      matches: Array.from({ length: 6 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        line: index + 1,
        text: `validation signal ${index + 1}`,
      })),
    },
    null,
    2,
  );
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
