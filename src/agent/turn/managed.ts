import { buildCheckpointContinuationInput } from "../checkpoint.js";
import { runAgentTurn } from "../runTurn.js";
import { createManagedSliceBudgetPauseTransition } from "../runtimeTransition.js";
import { runLeadOrchestrationLoop } from "../../orchestrator/leadLoop.js";
import { persistCheckpointTransition } from "./persistence.js";
import { evaluateManagedSliceBudget, resolveManagedSliceBudget } from "./managedBudget.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { ExecutionStore } from "../../execution/store.js";
import type { AgentIdentity, RunTurnOptions, RunTurnResult } from "../types.js";

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
  const managedBudget = resolveManagedSliceBudget(options.config);
  const isLead = (options.identity?.kind ?? "lead") === "lead";
  let managedWindowStartedAtMs = Date.now();
  let managedWindowSlicesUsed = 0;
  const yieldAfterToolSteps = resolveYieldAfterToolSteps(options);
  let nextInput = options.input;
  let session = options.session;

  for (let sliceIndex = 0; ; sliceIndex += 1) {
    if (isLead) {
      const orchestrated = await runLeadOrchestrationLoop({
        input: nextInput,
        cwd: options.cwd,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks,
      });
      if (orchestrated.kind === "return") {
        return orchestrated.result;
      }

      nextInput = orchestrated.input;
      session = orchestrated.session;
    }

    const result = await runSlice({
      ...options,
      input: nextInput,
      session,
      yieldAfterToolSteps,
    });
    session = result.session;

    if (isLead && shouldReboundToLeadOrchestration(result)) {
      options.callbacks?.onStatus?.(buildLeadReboundStatus(result.transition?.reason.code, result.pauseReason));
      const reboundInput = await resolveNextManagedInput({
        options,
        result: {
          ...result,
          session,
        },
        sliceIndex,
      });
      nextInput = reboundInput;
      continue;
    }

    if (!result.yielded || !yieldAfterToolSteps) {
      if (isLead && await hasActiveDelegatedWork(options.cwd)) {
        nextInput = buildContinuationInput(options.identity, session.checkpoint);
        continue;
      }

      return {
        ...result,
        session,
      };
    }

    managedWindowSlicesUsed += 1;
    const budgetDecision = evaluateManagedSliceBudget({
      budget: managedBudget,
      slicesUsed: managedWindowSlicesUsed,
      startedAtMs: managedWindowStartedAtMs,
    });
    if (budgetDecision.exhausted) {
      const transition = createManagedSliceBudgetPauseTransition(budgetDecision.snapshot);
      session = await persistCheckpointTransition(session, options.sessionStore, transition);
      if (isLead) {
        options.callbacks?.onStatus?.(
          `Managed continuation reached the slice budget window (${budgetDecision.snapshot.slicesUsed}/${budgetDecision.snapshot.maxSlices}, ${budgetDecision.snapshot.elapsedMs}ms). Returning control to lead orchestration.`,
        );
        managedWindowStartedAtMs = Date.now();
        managedWindowSlicesUsed = 0;
        nextInput = await resolveNextManagedInput({
          options,
          result: {
            ...result,
            session,
            yielded: false,
            yieldReason: undefined,
            paused: true,
            pauseReason: transition.reason.pauseReason,
            transition,
          },
          sliceIndex,
        });
        continue;
      }

      options.callbacks?.onStatus?.(transition.reason.pauseReason);
      return {
        ...result,
        session,
        yielded: false,
        yieldReason: undefined,
        paused: true,
        pauseReason: transition.reason.pauseReason,
        transition,
      };
    }

    nextInput = await resolveNextManagedInput({
      options,
      result: {
        ...result,
        session,
      },
      sliceIndex,
    });
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

function shouldReboundToLeadOrchestration(result: RunTurnResult): boolean {
  if (result.paused !== true || result.transition?.action !== "pause") {
    return false;
  }

  const code = result.transition.reason.code;
  return code === "pause.provider_recovery_budget_exhausted" || code === "pause.degradation_recovery_exhausted";
}

function buildLeadReboundStatus(reasonCode: string | undefined, pauseReason: string | undefined): string {
  if (reasonCode === "pause.provider_recovery_budget_exhausted") {
    return "Provider recovery budget was reached in this slice. Returning control to lead orchestration to choose the next move.";
  }

  if (reasonCode === "pause.degradation_recovery_exhausted") {
    return "Post-compaction degradation recovery budget was reached in this slice. Returning control to lead orchestration for the next step.";
  }

  return pauseReason || "Slice paused. Returning control to lead orchestration.";
}

async function hasActiveDelegatedWork(cwd: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  const active = await new ExecutionStore(context.stateRootDir).listRelevant({
    requestedBy: "lead",
    statuses: ["queued", "running"],
  });

  return active.some((item) =>
    item.profile === "teammate" || item.profile === "subagent" || item.profile === "background");
}

async function resolveNextManagedInput(input: {
  options: ManagedTurnOptions;
  result: RunTurnResult;
  sliceIndex: number;
}): Promise<string> {
  const defaultInput = buildContinuationInput(input.options.identity, input.result.session.checkpoint);
  const decision = await input.options.onYield?.({
    result: input.result,
    sliceIndex: input.sliceIndex,
    defaultInput,
  });
  return normalizeContinuationInput(decision?.input) ?? defaultInput;
}
