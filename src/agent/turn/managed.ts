import { buildCheckpointContinuationInput } from "../checkpoint.js";
import { runAgentTurn } from "../runTurn.js";
import { createManagedSliceBudgetPauseTransition } from "../runtimeTransition.js";
import { runLeadOrchestrationLoop } from "../../orchestrator/leadLoop.js";
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
  delegatedWaitPollIntervalMs?: number;
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
      if (orchestrated.kind === "wait_for_delegated_work") {
        await waitForDelegatedWorkToSettle({
          cwd: options.cwd,
          objectiveText: orchestrated.session.taskState?.objective,
          abortSignal: options.abortSignal,
          pollIntervalMs: options.delegatedWaitPollIntervalMs,
        });
        session = orchestrated.session;
        continue;
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
    const completedLeadHardBoundaryReview = leadHardBoundaryReviewInFlight;
    leadHardBoundaryReviewInFlight = false;

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
          pollIntervalMs: options.delegatedWaitPollIntervalMs,
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
            `Lead return gate reached the hard boundary (${budgetDecision.snapshot.slicesUsed}/${budgetDecision.snapshot.maxSlices}, ${budgetDecision.snapshot.elapsedMs}ms). Returning unfinished work to lead review.`,
          );
          managedWindowStartedAtMs = Date.now();
          managedWindowSlicesUsed = 0;
          leadHardBoundaryReviewInFlight = true;
          nextInput = buildLeadHardBoundaryReviewInput(options.identity, session.checkpoint, budgetDecision.snapshot);
          continue;
        }
        nextInput = buildUnfinishedLeadReviewInput(options.identity, session.checkpoint);
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

function buildUnfinishedLeadReviewInput(
  identity: AgentIdentity | undefined,
  checkpoint: RunTurnOptions["session"]["checkpoint"],
): string {
  return [
    "[internal] Unfinished lead-side control-plane work is still pending.",
    "Review the unresolved protocol or control-plane state and choose the next concrete action.",
    "Do not declare completion until the machine state is reconciled.",
    buildCheckpointContinuationInput(identity, checkpoint),
  ].join("\n");
}

function buildLeadHardBoundaryReviewInput(
  identity: AgentIdentity | undefined,
  checkpoint: RunTurnOptions["session"]["checkpoint"],
  snapshot: { slicesUsed: number; maxSlices: number; elapsedMs: number },
): string {
  return [
    "[internal] Unfinished delegated/protocol work reached a hard boundary; return to Lead review now.",
    `Hard boundary: ${snapshot.slicesUsed}/${snapshot.maxSlices} managed slices, elapsed ${snapshot.elapsedMs}ms.`,
    "Lead must review the unresolved work, summarize what is still pending, identify what has already been tried, and choose the next strategy: re-check with a different path, reassign, wait with a concrete reason, mark a failed/timeout state with evidence, or merge completed evidence.",
    "Do not ask the user whether to continue unless the next step requires a real user decision such as scope change, product tradeoff, missing requirement, or external authorization.",
    buildCheckpointContinuationInput(identity, checkpoint),
  ].join("\n");
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
