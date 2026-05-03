import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildInternalWakeInput } from "../../src/agent/checkpoint.js";
import { buildSessionRuntimeSummary } from "../../src/agent/runtimeMetrics.js";
import { createMessage, SessionStore } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { runManagedAgentTurn } from "../../src/agent/turn.js";
import type { AgentIdentity } from "../../src/agent/types.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import type { SessionRuntimeStats, ToolExecutionResult } from "../../src/types.js";
import { formatSessionRuntimeSummary } from "../../src/host/summary.js";
import {
  createCapturingToolRegistry,
  createFunctionTool,
  type JsonToolArgs,
} from "./live-api-harness.ts";

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-runtime-observability-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
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

  const phaseOneRegistry = createRuntimePackRegistry(workspace);
  const runtimeIdentity: AgentIdentity = {
    kind: "teammate",
    name: "runtime-verifier",
    role: "runtime_observability",
    teamName: "verification",
  };

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
  });

  const reloaded = await sessionStore.load(phaseOneResult.session.id);
  const phaseTwoRegistry = createRuntimePackRegistry(workspace);
  const phaseTwoResult = await runManagedAgentTurn({
    input: buildInternalWakeInput(runtimeIdentity),
    cwd: workspace,
    config: {
      ...config,
      yieldAfterToolSteps: 6,
    },
    session: reloaded,
    sessionStore,
    toolRegistry: phaseTwoRegistry,
    identity: runtimeIdentity,
  });

  const finalSession = await sessionStore.load(phaseTwoResult.session.id);
  const runtimeStats = finalSession.runtimeStats;
  const runtimeSummary = buildSessionRuntimeSummary(finalSession);
  const runtimeSummaryText = formatSessionRuntimeSummary(finalSession);
  const sessionSummaryPath = path.join(workspace, "validation", "runtime-observability-session-summary.md");
  const sessionSummaryText = await fs.readFile(sessionSummaryPath, "utf8");
  const reportPath = path.join(process.cwd(), "validation", "runtime-observability-report.md");

  await writeRuntimeReport({
    reportPath,
    workspace,
    sessionId: finalSession.id,
    model: config.model,
    phaseOneYielded: phaseOneResult.yielded,
    phaseOneToolCalls: phaseOneRegistry.calls,
    phaseTwoToolCalls: phaseTwoRegistry.calls,
    sessionSummaryPath,
    runtimeSummaryText,
    sessionSummaryText,
    runtimeStats,
  });

  console.log(JSON.stringify({
    workspace,
    model: config.model,
    sessionId: finalSession.id,
    phaseOneYielded: phaseOneResult.yielded,
    phaseOneToolCalls: phaseOneRegistry.calls,
    phaseTwoToolCalls: phaseTwoRegistry.calls,
    runtimeSummary,
    runtimeStats,
    sessionSummaryPath: path.relative(workspace, sessionSummaryPath),
    reportPath: path.relative(process.cwd(), reportPath),
  }, null, 2));

  assertRuntimeObservability({
    phaseOneYielded: phaseOneResult.yielded,
    phaseOneToolCalls: phaseOneRegistry.calls,
    phaseTwoToolCalls: phaseTwoRegistry.calls,
    runtimeStats,
    sessionSummaryText,
  });
  if (!(await exists(reportPath))) {
    throw new Error("validation/runtime-observability-report.md was not written.");
  }
}

function createRuntimePackRegistry(workspace: string) {
  const setupMarkerPath = path.join(workspace, ".runtime-pack-ready");

  return createCapturingToolRegistry(
    [
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
    async (name, args) => {
      switch (name) {
        case "capture_round3_runtime_pack":
          return captureRuntimePack(setupMarkerPath);
        case "write_round3_validation_summary":
          return writeRuntimePackSummary(workspace, setupMarkerPath, args);
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  );
}

async function captureRuntimePack(setupMarkerPath: string): Promise<ToolExecutionResult> {
  if (await exists(setupMarkerPath)) {
    return toolResult({
      ok: false,
      error: "capture_round3_runtime_pack already succeeded for the current objective. Continue without repeating it.",
    }, false);
  }

  await fs.writeFile(setupMarkerPath, "ready\n", "utf8");
  return toolResult(buildLargeRuntimePayload());
}

async function writeRuntimePackSummary(
  workspace: string,
  setupMarkerPath: string,
  args: JsonToolArgs,
): Promise<ToolExecutionResult> {
  if (!(await exists(setupMarkerPath))) {
    return toolResult({
      ok: false,
      error: "capture_round3_runtime_pack must succeed before write_round3_validation_summary.",
    }, false);
  }

  const relativePath = args.path ?? "validation/runtime-observability-session-summary.md";
  const absolutePath = path.resolve(workspace, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, args.content ?? "", "utf8");
  return toolResult({
    ok: true,
    path: path.relative(workspace, absolutePath) || relativePath,
    preview: (args.content ?? "").slice(0, 240),
  });
}

function buildLargeRuntimePayload(): string {
  return JSON.stringify(
    {
      ok: true,
      title: "Round3 runtime pack",
      path: "validation/round3-runtime-pack.json",
      format: "json",
      content: `ROUND3-REAL-API::${"R".repeat(24_000)}`,
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

async function writeRuntimeReport(input: {
  reportPath: string;
  workspace: string;
  sessionId: string;
  model: string;
  phaseOneYielded: boolean;
  phaseOneToolCalls: string[];
  phaseTwoToolCalls: string[];
  sessionSummaryPath: string;
  runtimeSummaryText: string;
  sessionSummaryText: string;
  runtimeStats: unknown;
}): Promise<void> {
  await fs.mkdir(path.dirname(input.reportPath), { recursive: true });
  await fs.writeFile(
    input.reportPath,
    [
      "# Runtime Observability Report",
      "",
      `- Generated at: ${new Date().toISOString()}`,
      `- Workspace: \`${input.workspace}\``,
      `- Session ID: \`${input.sessionId}\``,
      `- Model: \`${input.model}\``,
      `- Phase one yielded: \`${String(input.phaseOneYielded)}\``,
      `- Phase one tool calls: \`${input.phaseOneToolCalls.join(", ")}\``,
      `- Phase two tool calls: \`${input.phaseTwoToolCalls.join(", ")}\``,
      `- Session summary file: \`${path.relative(input.workspace, input.sessionSummaryPath)}\``,
      "",
      "## Runtime Summary",
      "",
      "```text",
      input.runtimeSummaryText,
      "```",
      "",
      "## Session Summary Preview",
      "",
      "```markdown",
      input.sessionSummaryText.trim(),
      "```",
      "",
      "## Runtime Stats Snapshot",
      "",
      "```json",
      JSON.stringify(input.runtimeStats, null, 2),
      "```",
    ].join("\n"),
    "utf8",
  );
}

function assertRuntimeObservability(input: {
  phaseOneYielded: boolean;
  phaseOneToolCalls: string[];
  phaseTwoToolCalls: string[];
  runtimeStats: SessionRuntimeStats | undefined;
  sessionSummaryText: string;
}): void {
  const { runtimeStats } = input;
  if (!input.phaseOneYielded) {
    throw new Error("Phase one did not yield after the runtime-pack setup step.");
  }
  if (!input.phaseOneToolCalls.includes("capture_round3_runtime_pack")) {
    throw new Error("Phase one did not call capture_round3_runtime_pack.");
  }
  if (input.phaseTwoToolCalls.includes("capture_round3_runtime_pack")) {
    throw new Error("Phase two repeated capture_round3_runtime_pack instead of resuming from the saved session.");
  }
  if (!input.phaseTwoToolCalls.includes("write_round3_validation_summary")) {
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

  const usageRequests = (runtimeStats.model?.usage?.requestsWithUsage ?? 0) +
    (runtimeStats.model?.usage?.requestsWithoutUsage ?? 0);
  if (usageRequests !== runtimeStats.model.requestCount) {
    throw new Error("Model usage availability counts do not match the recorded model request count.");
  }
  if (!input.sessionSummaryText.trim()) {
    throw new Error("The runtime observability session summary file is empty.");
  }
}

function toolResult(output: unknown, ok = true): ToolExecutionResult {
  return {
    ok,
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
  };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
