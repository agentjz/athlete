import { loadProjectContext } from "../context/projectContext.js";
import { analyzeOrchestratorInput } from "./analyze.js";
import { dispatchOrchestratorAction } from "./dispatch.js";
import { loadOrchestratorProgress } from "./progress.js";
import { routeOrchestratorAction } from "./route.js";
import { ensureTaskPlan } from "./taskPlanning.js";
import type { PreparedLeadTurn, PrepareLeadTurnOptions } from "./types.js";

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
  const decision = routeOrchestratorAction({
    progress,
    plan,
  });
  const dispatched = await dispatchOrchestratorAction({
    rootDir: projectContext.stateRootDir,
    cwd: options.cwd,
    config: options.config,
    session: options.session,
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
    decision,
  };
}
