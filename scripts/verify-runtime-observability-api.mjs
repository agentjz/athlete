#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCheckpointContinuationInput } from "../.test-build/src/agent/checkpoint.js";
import { createMessage } from "../.test-build/src/agent/messages.js";
import { buildSessionRuntimeSummary } from "../.test-build/src/agent/runtimeMetrics.js";
import { runManagedAgentTurn } from "../.test-build/src/agent/managedTurn.js";
import { runAgentTurn } from "../.test-build/src/agent/runTurn.js";
import { SessionStore } from "../.test-build/src/agent/sessionStore.js";
import { resolveRuntimeConfig } from "../.test-build/src/config/store.js";
import { formatSessionRuntimeSummary } from "../.test-build/src/ui/runtimeSummary.js";
async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "deadmouse-runtime-observability-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd(), mode: "agent" });
  if (!resolved.apiKey) {
    throw new Error("Missing DEADMOUSE_API_KEY in .deadmouse/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    yieldAfterToolSteps: 1,
    contextWindowMessages: 16,
    maxContextChars: 8_500,
    contextSummaryChars: 1_200,
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  const baseSession = await sessionStore.create(workspace);
  const seededSession = await sessionStore.save({
    ...baseSession,
    messages: Array.from({ length: 12 }, (_, index) =>
      createMessage("assistant", `preloaded-runtime-history-${index} ${"A".repeat(1_600)}`),
    ),
  });

  const phaseOneRegistry = createRound3ApiRegistry(workspace);
  const phaseOneToolCalls = [];
  const phaseTwoToolCalls = [];
  const runtimeIdentity = { kind: "teammate", name: "runtime-verifier", role: "runtime_observability", teamName: "verification" };

  const phaseOneResult = await runAgentTurn({
    input: [
      "Runtime observability dashboard validation.",
      "Phase one only: call capture_round3_runtime_pack exactly once in your first response.",
      "Do not call write_round3_validation_summary yet.",
      "After the tool completes the turn will yield and the session will be reloaded from disk.",
    ].join(" "),
    cwd: workspace,
    config,
    yieldAfterToolSteps: 1,
    session: seededSession,
    sessionStore,
    toolRegistry: phaseOneRegistry,
    callbacks: {
      onToolCall(name) {
        phaseOneToolCalls.push(name);
      },
    },
  });

  const reloaded = await sessionStore.load(phaseOneResult.session.id);
  const phaseTwoRegistry = createRound3ApiRegistry(workspace);
  const phaseTwoInput = buildCheckpointContinuationInput(runtimeIdentity, reloaded.checkpoint);

  const phaseTwoResult = await runManagedAgentTurn({ input: phaseTwoInput, cwd: workspace, config: { ...config, yieldAfterToolSteps: 6 }, session: reloaded, sessionStore, toolRegistry: phaseTwoRegistry, identity: runtimeIdentity, callbacks: { onToolCall(name) { phaseTwoToolCalls.push(name); } } });

  const finalSession = await sessionStore.load(phaseTwoResult.session.id);
  const runtimeStats = finalSession.runtimeStats;
  const runtimeSummary = buildSessionRuntimeSummary(finalSession);
  const runtimeSummaryText = formatSessionRuntimeSummary(finalSession);
  const sessionSummaryPath = path.join(workspace, "validation", "runtime-observability-session-summary.md");
  const sessionSummaryText = await fs.readFile(sessionSummaryPath, "utf8");
  const reportPath = path.join(process.cwd(), "validation", "runtime-observability-report.md");

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    [
      "# Runtime Observability Report",
      "",
      `- Generated at: ${new Date().toISOString()}`,
      `- Workspace: \`${workspace}\``,
      `- Session ID: \`${finalSession.id}\``,
      `- Model: \`${config.model}\``,
      `- Phase one yielded: \`${String(phaseOneResult.yielded)}\``,
      `- Phase one tool calls: \`${phaseOneToolCalls.join(", ")}\``,
      `- Phase two tool calls: \`${phaseTwoToolCalls.join(", ")}\``,
      `- Session summary file: \`${path.relative(workspace, sessionSummaryPath)}\``,
      "",
      "## Runtime Summary",
      "",
      "```text",
      runtimeSummaryText,
      "```",
      "",
      "## Session Summary Preview",
      "",
      "```markdown",
      sessionSummaryText.trim(),
      "```",
      "",
      "## Runtime Stats Snapshot",
      "",
      "```json",
      JSON.stringify(runtimeStats, null, 2),
      "```",
    ].join("\n"),
    "utf8",
  );

  const output = { workspace, model: config.model, sessionId: finalSession.id, phaseOneYielded: phaseOneResult.yielded, phaseOneToolCalls, phaseTwoToolCalls, runtimeSummary, runtimeStats, sessionSummaryPath: path.relative(workspace, sessionSummaryPath), reportPath: path.relative(process.cwd(), reportPath) };
  console.log(JSON.stringify(output, null, 2));

  if (!phaseOneResult.yielded) {
    throw new Error("Phase one did not yield after the runtime-pack setup step.");
  }
  if (!phaseOneToolCalls.includes("capture_round3_runtime_pack")) {
    throw new Error("Phase one did not call capture_round3_runtime_pack.");
  }
  if (phaseTwoToolCalls.includes("capture_round3_runtime_pack")) {
    throw new Error("Phase two repeated capture_round3_runtime_pack instead of resuming from the saved session.");
  }
  if (!phaseTwoToolCalls.includes("write_round3_validation_summary")) {
    throw new Error("Phase two did not write validation/runtime-observability-session-summary.md.");
  }
  if (!runtimeStats) {
    throw new Error("Runtime stats were not persisted into the final session.");
  }
  if ((runtimeStats.model?.requestCount ?? 0) < 2) {
    throw new Error("Runtime stats did not record the expected model request count.");
  }
  if ((runtimeStats.tools?.callCount ?? 0) < 2) {
    throw new Error("Runtime stats did not record the expected tool call count.");
  }
  if ((runtimeStats.events?.yieldCount ?? 0) < 1) {
    throw new Error("Runtime stats did not record the yield event.");
  }
  if ((runtimeStats.events?.continuationCount ?? 0) < 1) {
    throw new Error("Runtime stats did not record the continuation event.");
  }
  if ((runtimeStats.events?.compressionCount ?? 0) < 1) {
    throw new Error("Runtime stats did not record the compression event.");
  }
  if ((runtimeStats.externalizedToolResults?.count ?? 0) < 1) {
    throw new Error("Runtime stats did not record the externalized tool result.");
  }
  if ((runtimeStats.externalizedToolResults?.byteLengthTotal ?? 0) <= 16_000) {
    throw new Error("Runtime stats did not record the externalized tool-result byte total.");
  }

  const usageRequests = (runtimeStats.model?.usage?.requestsWithUsage ?? 0) + (runtimeStats.model?.usage?.requestsWithoutUsage ?? 0);
  if (usageRequests !== runtimeStats.model.requestCount) {
    throw new Error("Model usage availability counts do not match the recorded model request count.");
  }
  if (!sessionSummaryText.trim()) {
    throw new Error("The runtime observability session summary file is empty.");
  }
  if (!(await exists(reportPath))) {
    throw new Error("validation/runtime-observability-report.md was not written.");
  }
}

function createRound3ApiRegistry(workspace) {
  const setupMarkerPath = path.join(workspace, ".runtime-pack-ready");
  return {
    definitions: [
      createFunctionTool(
        "capture_round3_runtime_pack",
        "One-time round3 setup step. Call it exactly once in phase one and never repeat it after the session resumes.",
      ),
      createFunctionTool(
        "write_round3_validation_summary",
        "After the session is reloaded from disk, write validation/runtime-observability-session-summary.md and mention that the runtime pack was resumed instead of repeated.",
        {
          path: { type: "string" },
          content: { type: "string" },
        },
        ["path", "content"],
      ),
    ],
    async execute(name, rawArgs) {
      const args = rawArgs ? JSON.parse(rawArgs) : {};

      switch (name) {
        case "capture_round3_runtime_pack": {
          if (await exists(setupMarkerPath)) {
            return {
              ok: false,
              output: JSON.stringify(
                {
                  ok: false,
                  error: "capture_round3_runtime_pack already succeeded earlier in this session. Resume from the saved session instead of repeating it.",
                },
                null,
                2,
              ),
            };
          }

          await fs.writeFile(setupMarkerPath, "ready\n", "utf8");
          return {
            ok: true,
            output: buildLargeRuntimePayload(),
          };
        }
        case "write_round3_validation_summary": {
          if (!(await exists(setupMarkerPath))) {
            return {
              ok: false,
              output: JSON.stringify(
                {
                  ok: false,
                  error: "capture_round3_runtime_pack must succeed before write_round3_validation_summary.",
                },
                null,
                2,
              ),
            };
          }

          const relativePath = String(args.path ?? "validation/runtime-observability-session-summary.md");
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
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

function buildLargeRuntimePayload() {
  return JSON.stringify(
    {
      ok: true,
      title: "Round3 runtime pack",
      path: "validation/round3-runtime-pack.json",
      format: "json",
      content: "ROUND3-REAL-API::" + "R".repeat(24_000),
      entries: Array.from({ length: 100 }, (_, index) => ({
        path: `reports/runtime-${index}.md`,
        type: "file",
      })),
      matches: Array.from({ length: 6 }, (_, index) => ({
        path: `reports/runtime-${index}.md`,
        line: index + 1,
        text: `runtime signal ${index + 1}`,
      })),
    },
    null,
    2,
  );
}

async function exists(targetPath) {
  try { await fs.access(targetPath); return true; } catch { return false; }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
