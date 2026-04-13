import { noteCheckpointTransition } from "../agent/checkpoint/transitions.js";
import { buildRunTurnResult, createOrchestratorWaitTransition } from "../agent/runtimeTransition.js";
import type { SessionStoreLike } from "../agent/session/store.js";
import type { RunTurnResult } from "../agent/types.js";
import type { PreparedLeadTurn } from "./types.js";

export async function buildOrchestratorWaitResult(input: {
  prepared: PreparedLeadTurn;
  sessionStore: SessionStoreLike;
  onStatus?: (text: string) => void;
}): Promise<RunTurnResult> {
  const transition = createOrchestratorWaitTransition({
    taskIds: input.prepared.decision.wait?.taskIds,
    teammateNames: input.prepared.decision.wait?.teammateNames,
    backgroundJobIds: input.prepared.decision.wait?.backgroundJobIds,
    pauseReason: input.prepared.decision.reason,
  });
  const session = await input.sessionStore.save(
    noteCheckpointTransition(input.prepared.session, transition),
  );
  input.onStatus?.(input.prepared.decision.reason);
  return buildRunTurnResult({
    session,
    changedPaths: [],
    verificationAttempted: false,
    transition,
  });
}
