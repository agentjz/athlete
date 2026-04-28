import { buildInternalWakeInput } from "../checkpoint.js";
import { runAgentTurn } from "../runTurn.js";
import { createManagedSliceBudgetPauseTransition } from "../runtimeTransition.js";
import { persistCheckpointTransition } from "./persistence.js";
import { evaluateManagedSliceBudget, resolveManagedSliceBudget } from "./managedBudget.js";
import { hasUnfinishedLeadWork } from "./leadReturnGate.js";
import { hasActiveDelegatedWork, waitForDelegatedWorkToSettle } from "./delegatedWorkWait.js";
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
  let leadHardBoundaryReviewInFlight = false;

  for (let sliceIndex = 0; ; sliceIndex += 1) {
    const result = await runSlice({
      ...options,
      input: nextInput,
      session,
      yieldAfterToolSteps,
    });
    session = result.session;
    const completedLeadHardBoundaryReview = leadHardBoundaryReviewInFlight;
    leadHardBoundaryReviewInFlight = false;

    if (isLead && shouldReturnToLeadDecision(result)) {
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
      if (isLead && completedLeadHardBoundaryReview) {
        return {
          ...result,
          session,
        };
      }

      if (isLead && await hasActiveDelegatedWork(options.cwd, session.taskState?.objective)) {
        await waitForDelegatedWorkToSettle({
          cwd: options.cwd,
          objectiveText: session.taskState?.objective,
          abortSignal: options.abortSignal,
        });
        continue;
      }

      if (isLead && await hasUnfinishedLeadWork(options.cwd, session.taskState?.objective)) {
        managedWindowSlicesUsed += 1;
        const budgetDecision = evaluateManagedSliceBudget({
          budget: managedBudget,
          slicesUsed: managedWindowSlicesUsed,
          startedAtMs: managedWindowStartedAtMs,
        });
        if (budgetDecision.exhausted) {
          options.callbacks?.onStatus?.(
            `Lead return gate reached the runtime boundary (${budgetDecision.snapshot.slicesUsed}/${budgetDecision.snapshot.maxSlices}, ${budgetDecision.snapshot.elapsedMs}ms). Waking Lead.`,
          );
          managedWindowStartedAtMs = Date.now();
          managedWindowSlicesUsed = 0;
          leadHardBoundaryReviewInFlight = true;
          nextInput = buildContinuationInput(options.identity);
          continue;
        }
        nextInput = buildContinuationInput(options.identity);
        continue;
      }

      return {
        ...result,
        session,
      };
    }

    if (isLead && result.transition?.action === "yield" && result.transition.reason.code === "yield.delegation_dispatch") {
      await waitForDelegatedWorkToSettle({
        cwd: options.cwd,
        objectiveText: session.taskState?.objective,
        abortSignal: options.abortSignal,
      });
      nextInput = buildInternalWakeInput(options.identity);
      continue;
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
          `Managed continuation reached the slice budget window (${budgetDecision.snapshot.slicesUsed}/${budgetDecision.snapshot.maxSlices}, ${budgetDecision.snapshot.elapsedMs}ms). Returning control to Lead.`,
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
): string {
  return buildInternalWakeInput(identity);
}

function normalizeContinuationInput(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function shouldReturnToLeadDecision(result: RunTurnResult): boolean {
  if (result.paused !== true || result.transition?.action !== "pause") {
    return false;
  }

  const code = result.transition.reason.code;
  return code === "pause.provider_recovery_budget_exhausted" || code === "pause.degradation_recovery_exhausted";
}

function buildLeadReboundStatus(reasonCode: string | undefined, pauseReason: string | undefined): string {
  if (reasonCode === "pause.provider_recovery_budget_exhausted") {
    return "Provider recovery budget was reached in this slice. Returning control to Lead.";
  }

  if (reasonCode === "pause.degradation_recovery_exhausted") {
    return "Post-compaction degradation recovery budget was reached in this slice. Returning control to Lead.";
  }

  return pauseReason || "Slice paused. Returning control to Lead.";
}

async function resolveNextManagedInput(input: {
  options: ManagedTurnOptions;
  result: RunTurnResult;
  sliceIndex: number;
}): Promise<string> {
  const defaultInput = buildContinuationInput(input.options.identity);
  const decision = await input.options.onYield?.({
    result: input.result,
    sliceIndex: input.sliceIndex,
    defaultInput,
  });
  return normalizeContinuationInput(decision?.input) ?? defaultInput;
}
