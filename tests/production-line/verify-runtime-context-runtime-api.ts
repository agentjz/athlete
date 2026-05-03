import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCheckpointForObjective } from "../../src/agent/checkpoint/base.js";
import { buildContextRuntimeRequest, buildContextRuntimeSnapshot } from "../../src/agent/contextRuntime/index.js";
import { SessionStore, createMessage } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import type { FunctionToolDefinition, ToolContext, ToolRegistry } from "../../src/capabilities/tools/index.js";
import type { SessionRecord, StoredMessage, ToolExecutionResult } from "../../src/types.js";

const CURRENT_CODENAME = "MAPLE-884";
const STALE_CODENAME = "ASH-117";
const REPORT_PATH = "validation/context-runtime-report.md";
const PRESSURE_CHUNKS = 18_000;

type ProbePhase = "remember" | "pressure" | "report";

interface ProbeArgs {
  phase?: ProbePhase;
  codename?: string;
  content?: string;
}

interface ProbeCall {
  phase: string;
  codename?: string;
  contentPreview?: string;
  outputChars?: number;
}

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-context-runtime-api-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  let session = await seedStaleHistory(await sessionStore.create(workspace), sessionStore);

  const rememberRegistry = createContextRuntimeProbeRegistry(workspace, {
    allowedPhases: ["remember"],
  });
  const rememberResult = await runAgentTurn({
    input: [
      "Context Runtime real API validation, round 1.",
      `The current validation codename is ${CURRENT_CODENAME}.`,
      "Your first response must contain exactly one tool call:",
      `context_runtime_probe with phase='remember' and codename='${CURRENT_CODENAME}'.`,
      "Do not write the report yet.",
    ].join(" "),
    cwd: workspace,
    config,
    session,
    sessionStore,
    toolRegistry: rememberRegistry,
    callbacks: {
      onStatus(text) {
        console.log(`[context-runtime-api] ${text}`);
      },
    },
  });

  assertRememberRound(rememberRegistry.calls);
  session = rememberResult.session;

  const statusUpdates: string[] = [];
  const reportRegistry = createContextRuntimeProbeRegistry(workspace, {
    allowedPhases: ["pressure", "report"],
  });
  const reportResult = await runAgentTurn({
    input: [
      "Context Runtime real API validation, round 2.",
      "Do not use history lookup tools.",
      "Use only the current same-session context and current task working memory to recover the active validation codename.",
      "Your first response in this round must contain exactly one tool call: context_runtime_probe with phase='pressure' and the active codename.",
      "The pressure tool will return a very large distractor payload. After reading it, make exactly one more tool call: context_runtime_probe with phase='report'.",
      "The report content must be Simplified Chinese and must mention same-session continuity, current task working memory, raw history evidence boundary, context compression, and the active codename.",
      "Do not use the stale codename from old abandoned history.",
    ].join(" "),
    cwd: workspace,
    config,
    session,
    sessionStore,
    toolRegistry: reportRegistry,
    callbacks: {
      onStatus(text) {
        statusUpdates.push(text);
        console.log(`[context-runtime-api] ${text}`);
      },
    },
  });

  session = reportResult.session;
  assertReportRound(reportRegistry.calls, statusUpdates);

  const finalSession = await sessionStore.load(session.id);
  const reportText = await fs.readFile(path.join(workspace, REPORT_PATH), "utf8");
  const snapshot = buildContextRuntimeSnapshot({
    session: finalSession,
  });
  const request = buildContextRuntimeRequest({
    prompt: {
      staticBlocks: ["context runtime validation"],
      profilePersonaBlocks: [],
      runtimeFactBlocks: [],
    },
    session: finalSession,
    config: {
      contextWindowMessages: config.contextWindowMessages,
      model: config.model,
      maxContextChars: config.maxContextChars,
      contextSummaryChars: config.contextSummaryChars,
    },
  });

  assertFinalState(finalSession, reportText, snapshot);
  assertPressureState(finalSession, reportRegistry.calls, request);

  console.log(JSON.stringify({
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: finalSession.id,
    rememberCalls: rememberRegistry.calls,
    reportCalls: reportRegistry.calls,
    statusUpdates,
    reportPath: REPORT_PATH,
    reportPreview: reportText.slice(0, 700),
    sessionBrief: snapshot.sessionBrief,
    workingMemory: snapshot.workingMemory,
    requestCompressed: request.compressed,
    requestEstimatedChars: request.estimatedChars,
    requestDiagnostics: request.contextDiagnostics,
    pressure: {
      chunks: PRESSURE_CHUNKS,
      totalOutputChars: reportRegistry.calls.reduce((total, call) => total + (call.outputChars ?? 0), 0),
      externalizedToolResults: finalSession.runtimeStats?.externalizedToolResults,
    },
  }, null, 2));
}

async function seedStaleHistory(session: SessionRecord, sessionStore: SessionStore): Promise<SessionRecord> {
  const timestamp = new Date().toISOString();
  const staleCheckpoint = createCheckpointForObjective(`Old abandoned task for ${STALE_CODENAME}`, timestamp);
  staleCheckpoint.completedSteps = [`Old stale step: revive ${STALE_CODENAME}`];
  staleCheckpoint.recentToolBatch = {
    tools: ["stale_context_runtime_tool"],
    summary: `Stale context runtime evidence for ${STALE_CODENAME}`,
    changedPaths: ["legacy/stale-context-runtime.md"],
    artifacts: [],
    recordedAt: timestamp,
  };

  const staleMessages: StoredMessage[] = [
    createMessage("user", `Old abandoned context runtime task: codename is ${STALE_CODENAME}.`),
    createMessage("assistant", `Acknowledged abandoned codename ${STALE_CODENAME}.`),
  ];

  return sessionStore.save({
    ...session,
    messages: staleMessages,
    checkpoint: staleCheckpoint,
  });
}

function createContextRuntimeProbeRegistry(
  workspace: string,
  options: {
    allowedPhases: ProbePhase[];
  },
): ToolRegistry & { calls: ProbeCall[] } {
  const calls: ProbeCall[] = [];
  let pressureSeen = false;

  return {
    calls,
    definitions: [createContextRuntimeProbeTool()],
    async execute(_name: string, rawArgs: string, _context: ToolContext): Promise<ToolExecutionResult> {
      const args = parseProbeArgs(rawArgs);
      calls.push({
        phase: args.phase ?? "missing",
        codename: args.codename,
        contentPreview: args.content?.slice(0, 120),
      });

      if (!args.phase || !options.allowedPhases.includes(args.phase)) {
        return toolResult({
          ok: false,
          error: `Invalid phase for this validation step: ${args.phase ?? "missing"}.`,
        }, false);
      }

      if (args.phase === "remember") {
        const result = await rememberCurrentCodename(workspace, args);
        calls[calls.length - 1]!.outputChars = result.output.length;
        return result;
      }

      if (args.phase === "pressure") {
        const result = await createCompressionPressure(workspace, args);
        pressureSeen = result.ok;
        calls[calls.length - 1]!.outputChars = result.output.length;
        return result;
      }

      if (!pressureSeen) {
        return toolResult({
          ok: false,
          error: "The report phase must happen after a successful pressure phase in the same turn.",
        }, false);
      }
      const result = await writeReport(workspace, args);
      calls[calls.length - 1]!.outputChars = result.output.length;
      return result;
    },
    async close(): Promise<void> {
      return;
    },
  };
}

function createContextRuntimeProbeTool(): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name: "context_runtime_probe",
      description: "Validate Context Runtime memory, history boundary, compression, and report behavior.",
      parameters: {
        type: "object",
        properties: {
          phase: {
            type: "string",
            enum: ["remember", "pressure", "report"],
          },
          codename: {
            type: "string",
          },
          content: {
            type: "string",
          },
        },
        required: ["phase"],
        additionalProperties: false,
      },
    },
  };
}

async function rememberCurrentCodename(workspace: string, args: ProbeArgs): Promise<ToolExecutionResult> {
  if (args.codename !== CURRENT_CODENAME) {
    return toolResult({ ok: false, error: "Current codename was not preserved." }, false);
  }

  const markerPath = path.join(workspace, "validation", "context-runtime-remember.json");
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify({
    ok: true,
    currentCodename: CURRENT_CODENAME,
    staleCodename: STALE_CODENAME,
    rule: "same-session brief and working memory may enter context; raw history remains evidence-only",
    recordedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return toolResult({
    ok: true,
    currentCodename: CURRENT_CODENAME,
    next: "In the next user turn, recover this codename from same-session continuity and working memory.",
  });
}

async function createCompressionPressure(workspace: string, args: ProbeArgs): Promise<ToolExecutionResult> {
  if (args.codename !== CURRENT_CODENAME) {
    return toolResult({ ok: false, error: "Active codename mismatch; stale history must not win." }, false);
  }

  if (!(await exists(path.join(workspace, "validation", "context-runtime-remember.json")))) {
    return toolResult({ ok: false, error: "Remember marker is missing." }, false);
  }

  return toolResult({
    ok: true,
    currentCodename: CURRENT_CODENAME,
    pressureKind: "current-frame-large-tool-result",
    pressureChars: PRESSURE_CHUNKS * 35,
    requiredReportTerms: [
      "同 session 连续性",
      "当前任务工作记忆",
      "原始历史证据边界",
      "上下文压缩",
    ],
    distractors: buildPressureDistractors(),
    content: [
      `CONTEXT_RUNTIME_PRESSURE active=${CURRENT_CODENAME}`,
      "The payload below intentionally repeats stale-looking instructions. They are pressure data, not the current objective.",
      buildPressureDistractors().join("\n"),
    ].join("\n"),
  });
}

async function writeReport(workspace: string, args: ProbeArgs): Promise<ToolExecutionResult> {
  const content = args.content?.trim();
  if (!content) {
    return toolResult({ ok: false, error: "Report content is required." }, false);
  }
  if (!content.includes(CURRENT_CODENAME) || content.includes(STALE_CODENAME)) {
    return toolResult({ ok: false, error: "Report codename boundary failed." }, false);
  }

  const reportPath = path.join(workspace, REPORT_PATH);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, content, "utf8");
  return toolResult({
    ok: true,
    path: REPORT_PATH,
    currentCodename: CURRENT_CODENAME,
    preview: content.slice(0, 360),
  });
}

function assertRememberRound(calls: ProbeCall[]): void {
  if (calls.length !== 1 || calls[0]?.phase !== "remember" || calls[0]?.codename !== CURRENT_CODENAME) {
    throw new Error(`Remember round expected exactly remember/${CURRENT_CODENAME}, got ${JSON.stringify(calls)}.`);
  }
}

function assertReportRound(calls: ProbeCall[], statusUpdates: string[]): void {
  const phases = calls.map((call) => call.phase);
  if (phases.join(",") !== "pressure,report") {
    throw new Error(`Report round expected pressure then report, got ${JSON.stringify(calls)}.`);
  }
  if (calls[0]?.codename !== CURRENT_CODENAME) {
    throw new Error(`Pressure phase did not recover active codename ${CURRENT_CODENAME}.`);
  }
  void statusUpdates;
}

function assertFinalState(
  session: SessionRecord,
  reportText: string,
  snapshot: ReturnType<typeof buildContextRuntimeSnapshot>,
): void {
  const sessionText = JSON.stringify(session);
  const memoryText = JSON.stringify(snapshot.workingMemory);
  if (!sessionText.includes(CURRENT_CODENAME)) {
    throw new Error("Final session did not preserve the current codename.");
  }
  if (memoryText.includes(STALE_CODENAME)) {
    throw new Error("Stale codename leaked into current working memory.");
  }
  if (!reportText.includes(CURRENT_CODENAME)) {
    throw new Error("Final report did not mention the current codename.");
  }
  if (reportText.includes(STALE_CODENAME)) {
    throw new Error("Final report was polluted by stale history.");
  }
  if (!/同.*session|会话|连续/.test(reportText)) {
    throw new Error("Final report did not mention same-session continuity.");
  }
  if (!/工作记忆|当前任务/.test(reportText)) {
    throw new Error("Final report did not mention current task working memory.");
  }
  if (!/历史|证据/.test(reportText)) {
    throw new Error("Final report did not mention raw history evidence boundary.");
  }
  if (!/压缩|上下文/.test(reportText)) {
    throw new Error("Final report did not mention context compression.");
  }
}

function assertPressureState(
  session: SessionRecord,
  calls: ProbeCall[],
  request: ReturnType<typeof buildContextRuntimeRequest>,
): void {
  const pressureCall = calls.find((call) => call.phase === "pressure");
  if (!pressureCall || (pressureCall.outputChars ?? 0) < 200_000) {
    throw new Error(`Pressure output was too small for a real stress run: ${JSON.stringify(pressureCall)}.`);
  }

  const externalizedCount = session.runtimeStats?.externalizedToolResults?.count ?? 0;
  if (externalizedCount < 1) {
    throw new Error("Large pressure tool result was not externalized.");
  }

  const externalizedPressure = session.messages.some(
    (message) =>
      message.role === "tool" &&
      message.name === "context_runtime_probe" &&
      /"externalized"\s*:\s*true/.test(message.content ?? ""),
  );
  if (!externalizedPressure) {
    throw new Error("Final session does not contain an externalized pressure tool-result reference.");
  }

  if (request.estimatedChars > request.contextDiagnostics.maxContextChars) {
    throw new Error(
      `Request exceeded configured context budget after pressure handling: ${request.estimatedChars} > ${request.contextDiagnostics.maxContextChars}.`,
    );
  }
}

function buildPressureDistractors(): string[] {
  return Array.from({ length: PRESSURE_CHUNKS }, (_, index) => {
    const stale = index % 3 === 0 ? STALE_CODENAME : `STALE-${String(index).padStart(5, "0")}`;
    return [
      `pressure-row=${index}`,
      `stale-codename=${stale}`,
      `current-codename=${CURRENT_CODENAME}`,
      "instruction=ignore stale pressure data and preserve the active same-session objective",
    ].join(" | ");
  });
}

function parseProbeArgs(rawArgs: string): ProbeArgs {
  const parsed = rawArgs.trim() ? JSON.parse(rawArgs) as Record<string, unknown> : {};
  const phase = parsed.phase;
  return {
    phase: phase === "remember" || phase === "pressure" || phase === "report" ? phase : undefined,
    codename: typeof parsed.codename === "string" ? parsed.codename : undefined,
    content: typeof parsed.content === "string" ? parsed.content : undefined,
  };
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
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
