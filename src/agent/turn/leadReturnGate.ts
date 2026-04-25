import { loadProjectContext } from "../../context/projectContext.js";
import { ExecutionStore } from "../../execution/store.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";
import { TeamStore } from "../../team/store.js";

export async function hasUnfinishedLeadWork(cwd: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  const [executions, protocolRequests, teammates] = await Promise.all([
    new ExecutionStore(context.stateRootDir).listRelevant({
      requestedBy: "lead",
      statuses: ["queued", "running"],
    }),
    new ProtocolRequestStore(context.stateRootDir).list(),
    new TeamStore(context.stateRootDir).listMembers(),
  ]);
  const teammateByName = new Map(teammates.map((member) => [member.name, member]));

  const hasActiveDelegation = executions.some((item) =>
    item.profile === "teammate" || item.profile === "subagent" || item.profile === "background");
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

