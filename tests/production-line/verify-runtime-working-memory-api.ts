import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildInternalWakeInput } from "../../src/agent/checkpoint.js";
import { createCheckpointForObjective } from "../../src/agent/checkpoint/base.js";
import { SessionStore } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { buildAgentWorkingMemory } from "../../src/agent/contextRuntime/workingMemory/index.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import type { SessionRecord, StoredMessage, ToolExecutionResult } from "../../src/types.js";
import {
  createCapturingToolRegistry,
  createFunctionTool,
  type JsonToolArgs,
} from "./live-api-harness.ts";

const CURRENT_CODENAME = "ORCHID-512";
const STALE_CODENAME = "SALAMANDER-404";
const ROUND_COUNT = 5;

interface MemoryRound {
  index: number;
  toolName: string;
  description: string;
  markerPath: string;
}

interface RoundSnapshot {
  round: number;
  expectedTool: string;
  calls: string[];
  yielded: boolean;
  taskObjective?: string;
  checkpointStatus?: string;
  recentToolBatch?: string[];
  workingMemoryPreview: string;
}

const ROUNDS: MemoryRound[] = [
  {
    index: 1,
    toolName: "memory_round1_requirements",
    description: "Round 1 only: record the current objective requirements for the working-memory validation.",
    markerPath: "validation/memory-round-1-requirements.json",
  },
  {
    index: 2,
    toolName: "memory_round2_design",
    description: "Round 2 only: record the design decision after round 1 has succeeded.",
    markerPath: "validation/memory-round-2-design.json",
  },
  {
    index: 3,
    toolName: "memory_round3_tasks",
    description: "Round 3 only: record the task breakdown after the requirements and design facts exist.",
    markerPath: "validation/memory-round-3-tasks.json",
  },
  {
    index: 4,
    toolName: "memory_round4_verification",
    description: "Round 4 only: record verification evidence for the current objective.",
    markerPath: "validation/memory-round-4-verification.json",
  },
  {
    index: 5,
    toolName: "memory_round5_write_report",
    description: "Round 5 only: write validation/working-memory-report.md in Simplified Chinese.",
    markerPath: "validation/working-memory-report.md",
  },
];

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-working-memory-api-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    yieldAfterToolSteps: 1,
    contextWindowMessages: 8,
    maxContextChars: 8_500,
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
  const snapshots: RoundSnapshot[] = [];
  const allCalls: string[] = [];

  for (const round of ROUNDS) {
    const registry = createMemoryRoundRegistry(workspace, round);
    const input = round.index === 1
      ? buildInitialObjective()
      : buildInternalWakeInput({
          kind: "teammate",
          name: "working-memory-verifier",
          role: "runtime_working_memory",
          teamName: "production-line",
        });

    const result = await runAgentTurn({
      input,
      cwd: workspace,
      config,
      yieldAfterToolSteps: 1,
      session,
      sessionStore,
      toolRegistry: registry,
      callbacks: {
        onStatus(text) {
          console.log(`[working-memory-api] ${text}`);
        },
      },
    });

    session = result.session;
    allCalls.push(...registry.calls);
    snapshots.push(buildRoundSnapshot(round, registry.calls, result.session, result.yielded));
    assertRoundResult(round, registry.calls, result.yielded);
  }

  const finalSession = await sessionStore.load(session.id);
  const reportPath = path.join(workspace, "validation", "working-memory-report.md");
  const reportText = await fs.readFile(reportPath, "utf8");
  const finalWorkingMemory = buildAgentWorkingMemory({
    taskState: finalSession.taskState,
    todoItems: finalSession.todoItems,
    checkpoint: finalSession.checkpoint,
    verificationState: finalSession.verificationState,
    acceptanceState: finalSession.acceptanceState,
  });

  const output = {
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: finalSession.id,
    rounds: snapshots,
    allCalls,
    reportPath: path.relative(workspace, reportPath),
    reportPreview: reportText.slice(0, 600),
    finalWorkingMemory,
  };

  console.log(JSON.stringify(output, null, 2));

  assertFinalState(finalSession, finalWorkingMemory, reportText);
}

async function seedStaleHistory(session: SessionRecord, sessionStore: SessionStore): Promise<SessionRecord> {
  const timestamp = new Date().toISOString();
  const staleCheckpoint = createCheckpointForObjective(
    `Old abandoned objective for ${STALE_CODENAME}`,
    timestamp,
  );
  staleCheckpoint.completedSteps = [
    `Do not follow this stale step: revive ${STALE_CODENAME}`,
  ];
  staleCheckpoint.recentToolBatch = {
    tools: ["stale_history_tool"],
    summary: `Stale tool output for ${STALE_CODENAME}`,
    changedPaths: ["legacy/stale-history.md"],
    artifacts: [],
    recordedAt: timestamp,
  };

  const staleMessages: StoredMessage[] = [
    {
      role: "user",
      content: `Old task: always use ${STALE_CODENAME} as the project codename.`,
      createdAt: timestamp,
    },
    {
      role: "assistant",
      content: `Acknowledged old abandoned task ${STALE_CODENAME}.`,
      createdAt: timestamp,
    },
  ];

  return sessionStore.save({
    ...session,
    messages: staleMessages,
    checkpoint: staleCheckpoint,
  });
}

function buildInitialObjective(): string {
  return [
    "Runtime working-memory real API validation.",
    `The current project codename is ${CURRENT_CODENAME}.`,
    `Complete exactly ${ROUND_COUNT} rounds across this same current objective.`,
    "In every round, call the single exposed memory_round tool exactly once.",
    "Do not invent extra tools. Do not finish without calling the exposed tool.",
    "Round 5 must write validation/working-memory-report.md in Simplified Chinese.",
    "The report must mention the current codename, the five completed rounds, and whether the current working memory stayed stable.",
  ].join(" ");
}

function createMemoryRoundRegistry(workspace: string, round: MemoryRound) {
  const definition = round.index === 5
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
      return toolResult({
        ok: false,
        error: `Only ${round.toolName} is valid in round ${round.index}.`,
      }, false);
    }

    return round.index === 5
      ? writeFinalReport(workspace, round, args)
      : recordRoundMarker(workspace, round);
  });
}

async function recordRoundMarker(workspace: string, round: MemoryRound): Promise<ToolExecutionResult> {
  const previousMissing = await findMissingPreviousMarkers(workspace, round.index);
  if (previousMissing.length > 0) {
    return toolResult({
      ok: false,
      error: `Previous memory round marker(s) are missing: ${previousMissing.join(", ")}`,
    }, false);
  }

  const markerPath = path.join(workspace, round.markerPath);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify({
    ok: true,
    round: round.index,
    tool: round.toolName,
    currentCodename: CURRENT_CODENAME,
    recordedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return toolResult({
    ok: true,
    round: round.index,
    currentCodename: CURRENT_CODENAME,
    markerPath: round.markerPath,
    nextRound: round.index + 1,
  });
}

async function writeFinalReport(
  workspace: string,
  round: MemoryRound,
  args: JsonToolArgs,
): Promise<ToolExecutionResult> {
  const previousMissing = await findMissingPreviousMarkers(workspace, round.index);
  if (previousMissing.length > 0) {
    return toolResult({
      ok: false,
      error: `Cannot write report before previous memory markers exist: ${previousMissing.join(", ")}`,
    }, false);
  }

  const relativePath = args.path ?? round.markerPath;
  const absolutePath = path.resolve(workspace, relativePath);
  const content = args.content?.trim();
  if (!content) {
    return toolResult({
      ok: false,
      error: "Report content is required.",
    }, false);
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return toolResult({
    ok: true,
    round: round.index,
    currentCodename: CURRENT_CODENAME,
    path: path.relative(workspace, absolutePath) || relativePath,
    preview: content.slice(0, 320),
  });
}

async function findMissingPreviousMarkers(workspace: string, currentRound: number): Promise<string[]> {
  const previousRounds = ROUNDS.filter((round) => round.index < currentRound);
  const missing: string[] = [];
  for (const round of previousRounds) {
    const markerPath = path.join(workspace, round.markerPath);
    if (!(await exists(markerPath))) {
      missing.push(round.markerPath);
    }
  }
  return missing;
}

function buildRoundSnapshot(
  round: MemoryRound,
  calls: string[],
  session: SessionRecord,
  yielded: boolean,
): RoundSnapshot {
  const workingMemory = buildAgentWorkingMemory({
    taskState: session.taskState,
    todoItems: session.todoItems,
    checkpoint: session.checkpoint,
    verificationState: session.verificationState,
    acceptanceState: session.acceptanceState,
  });

  return {
    round: round.index,
    expectedTool: round.toolName,
    calls,
    yielded,
    taskObjective: session.taskState?.objective,
    checkpointStatus: session.checkpoint?.status,
    recentToolBatch: workingMemory.recentToolBatch?.tools,
    workingMemoryPreview: JSON.stringify(workingMemory).slice(0, 500),
  };
}

function assertRoundResult(round: MemoryRound, calls: string[], yielded: boolean): void {
  if (calls.length !== 1 || calls[0] !== round.toolName) {
    throw new Error(
      `Round ${round.index} expected exactly ${round.toolName}, got ${calls.length > 0 ? calls.join(", ") : "no tool call"}.`,
    );
  }
  if (!yielded) {
    throw new Error(`Round ${round.index} did not yield after the expected memory tool call.`);
  }
}

function assertFinalState(
  session: SessionRecord,
  workingMemory: ReturnType<typeof buildAgentWorkingMemory>,
  reportText: string,
): void {
  const memoryText = JSON.stringify(workingMemory);
  if (!session.taskState?.objective?.includes(CURRENT_CODENAME)) {
    throw new Error("Final session objective did not preserve the current working-memory objective.");
  }
  if (!memoryText.includes(CURRENT_CODENAME)) {
    throw new Error("Final working memory did not preserve the current codename.");
  }
  if (memoryText.includes(STALE_CODENAME)) {
    throw new Error("Stale historical codename leaked into current working memory.");
  }
  if (!reportText.includes(CURRENT_CODENAME)) {
    throw new Error("Final report did not mention the current codename.");
  }
  if (reportText.includes(STALE_CODENAME)) {
    throw new Error("Final report was polluted by stale session history.");
  }
  if (!workingMemory.recentToolBatch?.tools.includes("memory_round5_write_report")) {
    throw new Error("Final working memory did not record the round 5 tool batch.");
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
