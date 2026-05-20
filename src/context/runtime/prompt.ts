import { buildStaticPromptBlocks } from "../../agent/prompt/static.js";
import { buildSessionConversationBriefBlock } from "./sessionBrief/index.js";
import { buildProfilePersonaPromptBlocks, resolveAgentProfile } from "../../agent/profiles/registry.js";
import type { PromptLayers } from "../../agent/prompt/types.js";
import type { AgentProfile } from "../../agent/profiles/types.js";
import type { BuildContextRuntimePromptLayersInput } from "./types.js";
import { buildContextRuntimeSnapshot } from "./snapshot.js";

export function buildContextRuntimePromptLayers(
  input: BuildContextRuntimePromptLayersInput & { profile?: AgentProfile },
): PromptLayers {
  const resolvedProfile = input.profile ?? resolveAgentProfile(input.config.profile);
  const snapshot = buildContextRuntimeSnapshot({
    session: {
      messages: input.messages ?? [],
      todoItems: input.todoItems,
      taskState: input.taskState,
      checkpoint: input.checkpoint,
    },
  });
  const sessionBriefBlock = buildSessionConversationBriefBlock(snapshot.sessionBrief);
  const runtimeFactBlocks = resolvedProfile.runtimeFacts.buildBlocks({
    cwd: input.cwd,
    config: input.config,
    projectContext: input.projectContext,
    taskState: input.taskState,
    runtimeState: input.runtimeState ?? {},
    sessionBrief: snapshot.sessionBrief,
    workingMemory: snapshot.workingMemory,
    checkpoint: input.checkpoint,
  });

  return {
    staticBlocks: buildStaticPromptBlocks({
      config: input.config,
      projectContext: input.projectContext,
      runtimeState: input.runtimeState ?? {},
    }),
    profilePersonaBlocks: buildProfilePersonaPromptBlocks(resolvedProfile),
    runtimeFactBlocks: sessionBriefBlock
      ? [sessionBriefBlock, ...runtimeFactBlocks]
      : [...runtimeFactBlocks],
  };
}
