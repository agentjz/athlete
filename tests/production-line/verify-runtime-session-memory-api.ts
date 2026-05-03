import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCheckpointForObjective } from "../../src/agent/checkpoint/base.js";
import { SessionStore, createMessage } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { buildSessionConversationBrief } from "../../src/agent/contextRuntime/sessionBrief/index.js";
import { buildAgentWorkingMemory } from "../../src/agent/contextRuntime/workingMemory/index.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import type { SessionRecord, StoredMessage, ToolExecutionResult } from "../../src/types.js";
import {
  createCapturingToolRegistry,
  createFunctionTool,
  type JsonToolArgs,
} from "./live-api-harness.ts";

const CURRENT_CODENAME = "LYNX-731";
const STALE_CODENAME = "MOTH-009";
const ROUND_COUNT = 5;

interface SessionMemoryRound {
  index: number;
  toolName: string;
  description: string;
  prompt: string;
}

const ROUNDS: SessionMemoryRound[] = [
  {
    index: 1,
    toolName: "session_memory_round1_record_requirement",
    description: "Round 1 only: record the current session memory requirement.",
    prompt: [
      "Runtime same-session memory validation round 1.",
      `Current codename is ${CURRENT_CODENAME}.`,
      "Call the exposed round tool exactly once.",
      "Remember that the user wants same-session continuity, not cross-session long-term memory.",
    ].join(" "),
  },
  {
    index: 2,
    toolName: "session_memory_round2_confirm_boundary",
    description: "Round 2 only: confirm the history boundary without using stale codename.",
    prompt: [
      "Round 2.",
      "Based on this same session, confirm the boundary between same-session brief, working memory, and raw history.",
      "Call the exposed round tool exactly once.",
    ].join(" "),
  },
  {
    index: 3,
    toolName: "session_memory_round3_answer_continuity",
    description: "Round 3 only: answer a continuity question from the same-session brief.",
    prompt: [
      "Round 3.",
      "Without looking up old sessions, use the current same-session context to answer what we are validating.",
      "Call the exposed round tool exactly once.",
    ].join(" "),
  },
  {
    index: 4,
    toolName: "session_memory_round4_reject_stale_history",
    description: "Round 4 only: reject stale history and keep the current codename.",
    prompt: [
      `Round 4. A stale old history says the codename is ${STALE_CODENAME}.`,
      `For this current session, keep ${CURRENT_CODENAME}.`,
      "Call the exposed round tool exactly once.",
    ].join(" "),
  },
  {
    index: 5,
    toolName: "session_memory_round5_write_report",
    description: "Round 5 only: write validation/session-memory-report.md in Simplified Chinese.",
    prompt: [
      "Round 5.",
      "Write the final report in Simplified Chinese.",
      "It must mention same-session continuity, current task working memory, raw history evidence boundary, and the current codename.",
      "Call the exposed round tool exactly once.",
    ].join(" "),
  },
];

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-session-memory-api-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    contextWindowMessages: 8,
    maxContextChars: 9_000,
    contextSummaryChars: 1_200,
    maxToolIterations: 3,
    maxContinuationBatches: 1,
    maxOutputTokens: Math.min(resolved.maxOutputTokens ?? 1_200, 1_200),
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  let session = await seedStaleHistory(await sessionStore.create(workspace), sessionStore);
  const roundCalls: Array<{ round: number; calls: string[] }> = [];

  for (const round of ROUNDS) {
    const registry = createSessionMemoryRegistry(workspace, round);
    const result = await runAgentTurn({
      input: round.prompt,
      cwd: workspace,
      config,
      session,
      sessionStore,
      toolRegistry: registry,
      callbacks: {
        onStatus(text) {
          console.log(`[session-memory-api] ${text}`);
        },
      },
    });

    session = result.session;
    roundCalls.push({ round: round.index, calls: registry.calls });
    assertRoundCalls(round, registry.calls);
  }

  const finalSession = await sessionStore.load(session.id);
  const reportPath = path.join(workspace, "validation", "session-memory-report.md");
  const reportText = await fs.readFile(reportPath, "utf8");
  const sessionBrief = buildSessionConversationBrief({ messages: finalSession.messages });
  const workingMemory = buildAgentWorkingMemory({
    taskState: finalSession.taskState,
    todoItems: finalSession.todoItems,
    checkpoint: finalSession.checkpoint,
    verificationState: finalSession.verificationState,
    acceptanceState: finalSession.acceptanceState,
  });

  assertFinalState(finalSession, reportText);

  console.log(JSON.stringify({
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: finalSession.id,
    roundCalls,
    reportPath: path.relative(workspace, reportPath),
    reportPreview: reportText.slice(0, 600),
    sessionBrief,
    workingMemory,
  }, null, 2));
}

async function seedStaleHistory(session: SessionRecord, sessionStore: SessionStore): Promise<SessionRecord> {
  const timestamp = new Date().toISOString();
  const staleCheckpoint = createCheckpointForObjective(`Old stale memory for ${STALE_CODENAME}`, timestamp);
  staleCheckpoint.completedSteps = [`Old stale instruction: use ${STALE_CODENAME}`];
  staleCheckpoint.recentToolBatch = {
    tools: ["stale_session_memory_tool"],
    summary: `Stale session memory for ${STALE_CODENAME}`,
    changedPaths: ["legacy/stale-memory.md"],
    artifacts: [],
    recordedAt: timestamp,
  };

  const staleMessages: StoredMessage[] = [
    createMessage("user", `Old abandoned session memory: codename is ${STALE_CODENAME}.`),
    createMessage("assistant", `Acknowledged stale codename ${STALE_CODENAME}.`),
  ];

  return sessionStore.save({
    ...session,
    messages: staleMessages,
    checkpoint: staleCheckpoint,
  });
}

function createSessionMemoryRegistry(workspace: string, round: SessionMemoryRound) {
  const definition = round.index === ROUND_COUNT
    ? createFunctionTool(
        round.toolName,
        round.description,
        {
          path: { type: "string" },
          content: { type: "string" },
        },
        ["path", "content"],
      )
    : createFunctionTool(round.toolName, round.description);

  return createCapturingToolRegistry([definition], async (name, args) => {
    if (name !== round.toolName) {
      return toolResult({ ok: false, error: `Only ${round.toolName} is valid in round ${round.index}.` }, false);
    }
    return round.index === ROUND_COUNT
      ? writeFinalReport(workspace, args)
      : recordRound(workspace, round);
  });
}

async function recordRound(workspace: string, round: SessionMemoryRound): Promise<ToolExecutionResult> {
  const previousMissing = await findMissingPreviousMarkers(workspace, round.index);
  if (previousMissing.length > 0) {
    return toolResult({
      ok: false,
      error: `Previous session memory marker(s) missing: ${previousMissing.join(", ")}`,
    }, false);
  }

  const markerPath = path.join(workspace, "validation", `session-memory-round-${round.index}.json`);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify({
    ok: true,
    round: round.index,
    currentCodename: CURRENT_CODENAME,
    recordedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return toolResult({
    ok: true,
    round: round.index,
    currentCodename: CURRENT_CODENAME,
    nextRound: round.index + 1,
  });
}

async function writeFinalReport(workspace: string, args: JsonToolArgs): Promise<ToolExecutionResult> {
  const previousMissing = await findMissingPreviousMarkers(workspace, ROUND_COUNT);
  if (previousMissing.length > 0) {
    return toolResult({
      ok: false,
      error: `Cannot write report before previous markers exist: ${previousMissing.join(", ")}`,
    }, false);
  }

  const relativePath = args.path ?? "validation/session-memory-report.md";
  const absolutePath = path.resolve(workspace, relativePath);
  const content = args.content?.trim();
  if (!content) {
    return toolResult({ ok: false, error: "Report content is required." }, false);
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return toolResult({
    ok: true,
    round: ROUND_COUNT,
    currentCodename: CURRENT_CODENAME,
    path: path.relative(workspace, absolutePath),
    preview: content.slice(0, 320),
  });
}

async function findMissingPreviousMarkers(workspace: string, currentRound: number): Promise<string[]> {
  const missing: string[] = [];
  for (let index = 1; index < currentRound; index += 1) {
    const markerPath = path.join(workspace, "validation", `session-memory-round-${index}.json`);
    if (!(await exists(markerPath))) {
      missing.push(path.relative(workspace, markerPath));
    }
  }
  return missing;
}

function assertRoundCalls(round: SessionMemoryRound, calls: string[]): void {
  if (calls.length !== 1 || calls[0] !== round.toolName) {
    throw new Error(`Round ${round.index} expected exactly ${round.toolName}, got ${calls.join(", ") || "no call"}.`);
  }
}

function assertFinalState(session: SessionRecord, reportText: string): void {
  const sessionText = JSON.stringify(session);
  if (!sessionText.includes(CURRENT_CODENAME)) {
    throw new Error("Final session did not preserve the current codename.");
  }
  if (!reportText.includes(CURRENT_CODENAME)) {
    throw new Error("Final report did not preserve the current codename.");
  }
  if (reportText.includes(STALE_CODENAME)) {
    throw new Error("Final report was polluted by stale history codename.");
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
