import type { SessionStoreLike } from "../agent/session/store.js";
import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import { buildLeadExecutionInput } from "./leadInput.js";
import { prepareLeadTurn } from "./prepareLeadTurn.js";
import { buildOrchestratorWaitResult } from "./terminal.js";
import type { OrchestratorDispatchDependencies } from "./types.js";

const DEFAULT_MAX_ORCHESTRATION_PASSES = 8;
const DEFAULT_WAIT_POLL_INTERVAL_MS = 300;

export interface LeadLoopRunInput {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  abortSignal?: AbortSignal;
  callbacks?: AgentCallbacks;
  deps?: OrchestratorDispatchDependencies;
  maxPasses?: number;
  waitPollIntervalMs?: number;
}

export type LeadLoopOutcome =
  | {
      kind: "run_lead";
      input: string;
      session: SessionRecord;
    }
  | {
      kind: "return";
      result: RunTurnResult;
    };

export async function runLeadOrchestrationLoop(input: LeadLoopRunInput): Promise<LeadLoopOutcome> {
  let session = input.session;
  const maxPasses = Math.max(1, Math.trunc(input.maxPasses ?? DEFAULT_MAX_ORCHESTRATION_PASSES));
  const waitPollIntervalMs = normalizeWaitPollIntervalMs(input.waitPollIntervalMs);
  let orchestrationPasses = 0;

  for (;;) {
    throwIfAborted(input.abortSignal, "Lead orchestration was aborted.");
    const prepared = await prepareLeadTurn({
      input: input.input,
      cwd: input.cwd,
      config: input.config,
      session,
      sessionStore: input.sessionStore,
      callbacks: input.callbacks,
      deps: input.deps,
    });
    session = prepared.session;

    if (prepared.decision.action === "wait_for_existing_work") {
      const waitResult = await buildOrchestratorWaitResult({
        prepared,
        sessionStore: input.sessionStore,
      });
      session = waitResult.session;
      await sleepWithSignal(waitPollIntervalMs, input.abortSignal);
      continue;
    }
    orchestrationPasses += 1;

    if (prepared.decision.action === "self_execute") {
      return {
        kind: "run_lead",
        input: buildLeadExecutionInput({
          fallbackInput: input.input,
          decision: prepared.decision,
        }),
        session,
      };
    }

    if (orchestrationPasses >= maxPasses) {
      throw new Error(`Lead orchestration exceeded ${maxPasses} passes without converging on execute-or-wait.`);
    }
  }
}

function normalizeWaitPollIntervalMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WAIT_POLL_INTERVAL_MS;
  }

  return Math.max(100, Math.trunc(value));
}

