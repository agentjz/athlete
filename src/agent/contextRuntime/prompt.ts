import { buildStaticPromptBlocks } from "../prompt/static.js";
import { buildSessionConversationBriefBlock } from "./sessionBrief/index.js";
import { buildProfilePersonaPromptBlocks, resolveAgentProfile } from "../profiles/registry.js";
import type { PromptLayers } from "../prompt/types.js";
import type { AgentProfile } from "../profiles/types.js";
import type { SkillRuntimeState } from "../../types.js";
import type { BuildContextRuntimePromptLayersInput } from "./types.js";
import { buildContextRuntimeSnapshot } from "./snapshot.js";

export function buildContextRuntimePromptLayers(
  input: BuildContextRuntimePromptLayersInput & { profile?: AgentProfile },
): PromptLayers {
  const resolvedSkillRuntimeState = input.skillRuntimeState ?? createEmptySkillRuntimeState();
  const resolvedProfile = input.profile ?? resolveAgentProfile(input.config.profile);
  const snapshot = buildContextRuntimeSnapshot({
    session: {
      messages: input.messages ?? [],
      taskState: input.taskState,
      todoItems: input.todoItems,
      checkpoint: input.checkpoint,
      verificationState: input.verificationState,
      acceptanceState: input.acceptanceState,
    },
  });
  const sessionBriefBlock = buildSessionConversationBriefBlock(snapshot.sessionBrief);
  const runtimeFactBlocks = resolvedProfile.runtimeFacts.buildBlocks({
    cwd: input.cwd,
    config: input.config,
    projectContext: input.projectContext,
    taskState: input.taskState,
    verificationState: input.verificationState,
    runtimeState: input.runtimeState ?? {},
    skillRuntimeState: resolvedSkillRuntimeState,
    sessionBrief: snapshot.sessionBrief,
    workingMemory: snapshot.workingMemory,
    checkpoint: input.checkpoint,
    acceptanceState: input.acceptanceState,
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
      : runtimeFactBlocks,
  };
}

function createEmptySkillRuntimeState(): SkillRuntimeState {
  return {
    loadedSkills: [],
    loadedSkillNames: new Set<string>(),
  };
}
