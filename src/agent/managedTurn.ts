import { buildCheckpointContinuationInput } from "./checkpoint.js";
import { runAgentTurn } from "./runTurn.js";
import { prepareLeadTurn } from "../orchestrator/prepareLeadTurn.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "./types.js";

export interface ManagedTurnYieldContext {
  result: RunTurnResult;
  sliceIndex: number;
  defaultInput: string;
}

export interface ManagedTurnYieldDecision {
  input?: string;
}

export interface ManagedTurnOptions extends RunTurnOptions {
  onYield?: (
    context: ManagedTurnYieldContext,
  ) => Promise<ManagedTurnYieldDecision | void> | ManagedTurnYieldDecision | void;
  runSlice?: (options: RunTurnOptions) => Promise<RunTurnResult>;
}

export async function runManagedAgentTurn(options: ManagedTurnOptions): Promise<RunTurnResult> {
  const runSlice = options.runSlice ?? runAgentTurn;
  const yieldAfterToolSteps = resolveYieldAfterToolSteps(options);
  let nextInput = options.input;
  let session = options.session;

  for (let sliceIndex = 0; ; sliceIndex += 1) {
    if ((options.identity?.kind ?? "lead") === "lead") {
      const prepared = await prepareLeadTurn({
        input: nextInput,
        cwd: options.cwd,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        callbacks: options.callbacks,
      });
      session = prepared.session;
    }

    const result = await runSlice({
      ...options,
      input: nextInput,
      session,
      yieldAfterToolSteps,
    });
    session = result.session;

    if (!result.yielded || !yieldAfterToolSteps) {
      return {
        ...result,
        session,
      };
    }

    const defaultInput = buildContinuationInput(options.identity, session.checkpoint);
    const decision = await options.onYield?.({
      result: {
        ...result,
        session,
      },
      sliceIndex,
      defaultInput,
    });
    nextInput = normalizeContinuationInput(decision?.input) ?? defaultInput;
  }
}

function resolveYieldAfterToolSteps(options: ManagedTurnOptions): number | undefined {
  if (options.identity?.kind === "subagent") {
    return undefined;
  }

  const configured =
    typeof options.yieldAfterToolSteps === "number"
      ? options.yieldAfterToolSteps
      : options.config.yieldAfterToolSteps;

  if (!Number.isFinite(configured) || configured <= 0) {
    return undefined;
  }

  return Math.trunc(configured);
}

function buildContinuationInput(
  identity: AgentIdentity | undefined,
  checkpoint: RunTurnOptions["session"]["checkpoint"],
): string {
  return buildCheckpointContinuationInput(identity, checkpoint);
}

function normalizeContinuationInput(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
