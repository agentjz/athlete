import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import { ExecutionStore } from "../../execution/store.js";

export const DREAMING_LOOP_STATE_PROTOCOL = "kitty.dreaming-loop-state" as const;

export interface DreamingLoopRound {
  roundNumber: number;
  roundId: string;
  executionId: string;
  objective: string;
  status: "started" | "completed" | "failed" | "paused" | "aborted";
  decisionOwner: "lead";
  startedAt: string;
  completedAt?: string;
  closeoutRef?: string;
  artifactRefs: readonly string[];
  factualSummary?: string;
}

export interface DreamingLoopState {
  protocol: typeof DREAMING_LOOP_STATE_PROTOCOL;
  loopId: string;
  objective: string;
  scope: string;
  evaluator: string;
  status: "waiting_for_lead" | "round_running" | "completed" | "paused" | "failed";
  decisionOwner: "lead";
  rounds: readonly DreamingLoopRound[];
  createdAt: string;
  updatedAt: string;
}

export function getDreamingLoopDir(rootDir: string, loopId: string): string {
  return path.join(getProjectStatePaths(rootDir).kittyDir, "dreaming-loops", normalizeId(loopId));
}

export function getDreamingLoopStatePath(rootDir: string, loopId: string): string {
  return path.join(getDreamingLoopDir(rootDir, loopId), "state.json");
}

export function getDreamingLoopLedgerPath(rootDir: string, loopId: string): string {
  return path.join(getDreamingLoopDir(rootDir, loopId), "iteration-ledger.jsonl");
}

export async function writeDreamingLoopState(rootDir: string, state: DreamingLoopState): Promise<DreamingLoopState> {
  const normalized: DreamingLoopState = {
    ...state,
    loopId: normalizeId(state.loopId),
    decisionOwner: "lead",
    updatedAt: new Date().toISOString(),
  };
  const file = getDreamingLoopStatePath(rootDir, normalized.loopId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function readDreamingLoopState(rootDir: string, loopId: string): Promise<DreamingLoopState> {
  const parsed = JSON.parse(await fs.readFile(getDreamingLoopStatePath(rootDir, loopId), "utf8")) as DreamingLoopState;
  return {
    ...parsed,
    loopId: normalizeId(parsed.loopId),
    decisionOwner: "lead",
    rounds: [...parsed.rounds],
  };
}

export async function appendDreamingLoopLedger(input: {
  rootDir: string;
  loopId: string;
  event: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const file = getDreamingLoopLedgerPath(input.rootDir, input.loopId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(
    file,
    `${JSON.stringify({
      protocol: DREAMING_LOOP_STATE_PROTOCOL,
      loopId: normalizeId(input.loopId),
      event: input.event,
      data: input.data ?? {},
      createdAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
}

export async function reconcileDreamingLoopState(rootDir: string, loopId: string): Promise<DreamingLoopState> {
  const state = await readDreamingLoopState(rootDir, loopId);
  const store = new ExecutionStore(rootDir);
  let changed = false;
  const rounds = await Promise.all(state.rounds.map(async (round) => {
    if (round.status !== "started") {
      return round;
    }
    const execution = await store.load(round.executionId).catch(() => undefined);
    if (!execution || (execution.status !== "completed" && execution.status !== "failed" && execution.status !== "paused" && execution.status !== "aborted")) {
      return round;
    }
    changed = true;
    return {
      ...round,
      status: execution.status,
      completedAt: execution.finishedAt ?? execution.updatedAt,
      closeoutRef: execution.id,
      artifactRefs: [
        ...round.artifactRefs,
        ...[execution.resultText ? `execution:${execution.id}:resultText` : "", execution.output ? `execution:${execution.id}:output` : ""].filter(Boolean),
      ],
      factualSummary: execution.summary,
    };
  }));

  if (!changed) {
    return state;
  }

  const hasRunningRound = rounds.some((round) => round.status === "started");
  const nextState = await writeDreamingLoopState(rootDir, {
    ...state,
    status: hasRunningRound ? "round_running" : "waiting_for_lead",
    rounds,
  });
  await appendDreamingLoopLedger({
    rootDir,
    loopId,
    event: "round_facts_reconciled",
    data: {
      status: nextState.status,
      rounds: rounds.map((round) => ({
        roundId: round.roundId,
        executionId: round.executionId,
        status: round.status,
      })),
      decisionOwner: "lead",
    },
  });
  return nextState;
}

export function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
