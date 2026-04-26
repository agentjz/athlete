import { createInternalReminder } from "../agent/session/taskState.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import type { OrchestratorDecision, OrchestratorTaskKind } from "./types.js";

export function buildLeadExecutionInput(input: {
  fallbackInput: string;
  decision: OrchestratorDecision;
}): string {
  const task = input.decision.task;
  if (!task) {
    return input.fallbackInput;
  }

  const lifecycle = getOrchestratorTaskLifecycle(task);
  return createInternalReminder([
    "Orchestrator selected the next formal lead stage from machine state.",
    `Task #${task.record.id}: ${task.record.subject}`,
    `Stage: ${task.meta.kind}`,
    `Objective: ${task.meta.objective}`,
    `Reason: ${input.decision.reason}`,
    `Lifecycle: ${lifecycle.stage} (${lifecycle.reasonCode})`,
    stageInstruction(task.meta.kind, lifecycle.illegal, task.meta.executor),
    "<base-input>",
    input.fallbackInput,
    "</base-input>",
  ].join("\n"));
}

function stageInstruction(kind: OrchestratorTaskKind, illegal: boolean, executor: string | undefined): string {
  if (illegal) {
    return "Reconcile the control-plane conflict on this task before doing any other work.";
  }

  if (kind === "implementation" && executor === "teammate") {
    return "The current objective opened the team lane. Decide the teammate configuration yourself: name, role, assignment, count, and whether to call spawn_teammate; if the user explicitly asked for a teammate, normally spawn at least one unless a real boundary blocks it. Do not rely on a machine-generated teammate.";
  }

  switch (kind) {
    case "merge":
      return "Perform only the formal merge stage: collect delegated results, reconcile the task board, and close the loop for this objective.";
    case "validation":
      return "Perform only the formal validation stage for this task before any closeout.";
    case "survey":
      return "Reconcile the survey stage only if dispatch cannot proceed automatically.";
    default:
      return "Perform only this lead-owned implementation stage before switching tasks.";
  }
}
