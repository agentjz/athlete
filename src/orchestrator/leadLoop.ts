import type { SessionStoreLike } from "../agent/session/store.js";
import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { buildLeadExecutionInput } from "./leadInput.js";
import { prepareLeadTurn } from "./prepareLeadTurn.js";
import { buildOrchestratorWaitResult } from "./terminal.js";
import type { OrchestratorDispatchDependencies } from "./types.js";

const DEFAULT_MAX_ORCHESTRATION_PASSES = 8;

export interface LeadLoopRunInput {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  callbacks?: AgentCallbacks;
  deps?: OrchestratorDispatchDependencies;
  maxPasses?: number;
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

  for (let pass = 0; pass < maxPasses; pass += 1) {
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
      return {
        kind: "return",
        result: await buildOrchestratorWaitResult({
          prepared,
          sessionStore: input.sessionStore,
          onStatus: input.callbacks?.onStatus,
        }),
      };
    }

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
  }

  throw new Error(`Lead orchestration exceeded ${maxPasses} passes without converging on execute-or-wait.`);
}
