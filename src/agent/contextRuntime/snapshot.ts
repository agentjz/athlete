import { buildSessionConversationBrief } from "./sessionBrief/index.js";
import { buildAgentWorkingMemory } from "./workingMemory/index.js";
import type { BuildContextRuntimeSnapshotInput, ContextRuntimeSnapshot } from "./types.js";

export function buildContextRuntimeSnapshot(
  input: BuildContextRuntimeSnapshotInput,
): ContextRuntimeSnapshot {
  return {
    sessionBrief: buildSessionConversationBrief({
      messages: input.session.messages,
    }),
    workingMemory: buildAgentWorkingMemory({
      taskState: input.session.taskState,
      todoItems: input.session.todoItems,
      checkpoint: input.session.checkpoint,
      verificationState: input.session.verificationState,
      acceptanceState: input.session.acceptanceState,
    }),
    historyBoundary: {
      rawHistoryPolicy: "evidence_lookup_only",
      automaticSurfaces: [
        "same-session conversation brief",
        "current-objective working memory",
      ],
    },
    toolProgress: input.toolProgress,
  };
}
