import { loadProjectContext } from "../../context/projectContext.js";
import type { ExecutionRecord } from "../../execution/types.js";
import { ExecutionStore } from "../../execution/store.js";
import { buildOrchestratorObjective, readOrchestratorTask } from "../../orchestrator/metadata.js";
import type { OrchestratorTaskSnapshot } from "../../orchestrator/types.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";
import { TeamStore } from "../../team/store.js";
import { TaskStore } from "../../tasks/store.js";

export async function hasUnfinishedLeadWork(cwd: string, objectiveText?: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  const [executions, protocolRequests, teammates, tasks] = await Promise.all([
    new ExecutionStore(context.stateRootDir).listRelevant({
      requestedBy: "lead",
      statuses: ["queued", "running"],
    }),
    new ProtocolRequestStore(context.stateRootDir).list(),
    new TeamStore(context.stateRootDir).listMembers(),
    new TaskStore(context.stateRootDir).list(),
  ]);
  const teammateByName = new Map(teammates.map((member) => [member.name, member]));
  const objective = objectiveText ? buildOrchestratorObjective(objectiveText) : undefined;
  const relevantTasks = objective
    ? tasks
        .map((task) => readOrchestratorTask(task))
        .filter((task): task is OrchestratorTaskSnapshot => Boolean(task && task.meta.key === objective.key))
    : [];

  const hasActiveDelegation = executions.some((item) =>
    (item.profile === "teammate" || item.profile === "subagent" || item.profile === "background") &&
    (!objective || isExecutionRelevantToObjective(item, objective.key, relevantTasks)));
  const hasPendingProtocol = protocolRequests.some((request) => {
    if (request.from !== "lead" || request.status !== "pending") {
      return false;
    }
    if (request.kind === "shutdown" && teammateByName.get(request.to)?.status === "shutdown") {
      return false;
    }
    return true;
  });

  return hasActiveDelegation || hasPendingProtocol;
}

function isExecutionRelevantToObjective(
  execution: ExecutionRecord,
  objectiveKey: string,
  relevantTasks: OrchestratorTaskSnapshot[],
): boolean {
  if (execution.objectiveKey && execution.objectiveKey === objectiveKey) {
    return true;
  }

  const relevantTaskIds = new Set(relevantTasks.map((task) => task.record.id));
  if (typeof execution.taskId === "number" && relevantTaskIds.has(execution.taskId)) {
    return true;
  }

  return relevantTasks.some((task) =>
    task.meta.executionId === execution.id || task.meta.jobId === execution.id);
}
