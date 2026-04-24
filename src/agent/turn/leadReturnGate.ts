import { loadProjectContext } from "../../context/projectContext.js";
import { ExecutionStore } from "../../execution/store.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";

export async function hasUnfinishedLeadWork(cwd: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  const [executions, protocolRequests] = await Promise.all([
    new ExecutionStore(context.stateRootDir).listRelevant({
      requestedBy: "lead",
      statuses: ["queued", "running"],
    }),
    new ProtocolRequestStore(context.stateRootDir).list(),
  ]);

  const hasActiveDelegation = executions.some((item) =>
    item.profile === "teammate" || item.profile === "subagent" || item.profile === "background");
  const hasPendingProtocol = protocolRequests.some((request) => request.from === "lead" && request.status === "pending");

  return hasActiveDelegation || hasPendingProtocol;
}

