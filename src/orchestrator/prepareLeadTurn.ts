import { loadProjectContext } from "../context/projectContext.js";
import { analyzeOrchestratorInput } from "./analyze.js";
import { evaluateDelegationNecessity } from "./delegation/evaluator.js";
import { getDelegationModeProfile } from "./delegation/mode.js";
import { applyDelegationPolicyGate } from "./delegation/policyGate.js";
import { isDelegationDecisionAction } from "./delegation/types.js";
import { dispatchOrchestratorAction } from "./dispatch.js";
import { loadOrchestratorProgress } from "./progress.js";
import { applyOrchestratorReturnBarrier, readOrchestratorReturnBarrierState } from "./returnBarrier.js";
import { routeOrchestratorAction } from "./route.js";
import { ensureTaskPlan } from "./taskPlanning.js";
import type { OrchestratorProgressSnapshot, PreparedLeadTurn, PrepareLeadTurnOptions } from "./types.js";

export async function prepareLeadTurn(options: PrepareLeadTurnOptions): Promise<PreparedLeadTurn> {
  const projectContext = await loadProjectContext(options.cwd);
  const analysis = analyzeOrchestratorInput({
    input: options.input,
    session: options.session,
  });
  let progress = await loadOrchestratorProgress({
    rootDir: projectContext.stateRootDir,
    cwd: options.cwd,
    objective: analysis.objective,
  });
  const seededPlan = await ensureTaskPlan({
    rootDir: projectContext.stateRootDir,
    cwd: options.cwd,
    analysis,
    existingTasks: progress.relevantTasks,
  });
  progress = await loadOrchestratorProgress({
    rootDir: projectContext.stateRootDir,
    cwd: options.cwd,
    objective: analysis.objective,
  });
  const plan = {
    ...seededPlan,
    tasks: progress.relevantTasks,
    readyTasks: progress.readyTasks,
  };
  let decision = routeOrchestratorAction({
    progress,
    plan,
  });

  if (isDelegationDecisionAction(decision.action)) {
    const mode = getDelegationModeProfile(options.config.delegationMode);
    const evaluation = evaluateDelegationNecessity({
      decisionAction: decision.action,
      analysis,
      progress,
    });
    const gate = applyDelegationPolicyGate({
      decisionAction: decision.action,
      evaluation,
      mode,
      activeDelegationCount: readActiveDelegationCount(progress),
      returnBarrierPending: readOrchestratorReturnBarrierState(options.session).pending && !isExplicitDelegationRequested(analysis),
    });
    if (!gate.allow) {
      decision = {
        action: "self_execute",
        reason: `Delegation blocked by policy gate (${gate.reasonCode}): ${gate.reason}`,
        task: decision.task,
      };
    }
  }

  const returnBarrierDecision = applyOrchestratorReturnBarrier(options.session, decision, {
    allowExplicitDelegation: isExplicitDelegationRequested(analysis),
  });
  decision = returnBarrierDecision.decision;
  const dispatched = await dispatchOrchestratorAction({
    rootDir: projectContext.stateRootDir,
    cwd: options.cwd,
    config: options.config,
    session: returnBarrierDecision.session,
    sessionStore: options.sessionStore,
    analysis,
    decision,
    callbacks: options.callbacks,
    deps: options.deps,
  });

  return {
    session: dispatched.session,
    analysis,
    progress,
    plan,
    decision: dispatched.decision,
  };
}

function isExplicitDelegationRequested(analysis: Pick<PreparedLeadTurn["analysis"], "delegationDirective">): boolean {
  return Boolean(analysis.delegationDirective?.teammate || analysis.delegationDirective?.subagent);
}

function readActiveDelegationCount(progress: OrchestratorProgressSnapshot): number {
  const activeIds = new Set<string>();
  for (const execution of progress.activeExecutions) {
    if (execution.profile === "subagent" || execution.profile === "teammate" || execution.profile === "background") {
      activeIds.add(execution.id);
    }
  }
  return activeIds.size;
}
