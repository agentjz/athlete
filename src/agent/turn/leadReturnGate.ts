import { loadProjectContext } from "../../context/projectContext.js";
import { hasActiveLeadWaitExecutions } from "../../execution/leadWait.js";
import { ProtocolRequestStore } from "../../capabilities/team/requestStore.js";
import { TeamStore } from "../../capabilities/team/store.js";

export async function hasUnfinishedLeadWork(cwd: string, objectiveText?: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  const [hasActiveExecutionWait, protocolRequests, teammates] = await Promise.all([
    hasActiveLeadWaitExecutions(cwd, objectiveText, context.stateRootDir),
    new ProtocolRequestStore(context.stateRootDir).list(),
    new TeamStore(context.stateRootDir).listMembers(),
  ]);
  const teammateByName = new Map(teammates.map((member) => [member.name, member]));
  const hasPendingProtocol = protocolRequests.some((request) => {
    if (request.from !== "lead" || request.status !== "pending") {
      return false;
    }
    if (request.kind === "shutdown" && teammateByName.get(request.to)?.status === "shutdown") {
      return false;
    }
    return true;
  });

  return hasActiveExecutionWait || hasPendingProtocol;
}
