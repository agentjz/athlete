import { buildDynamicPromptBlocks } from "./prompt/dynamic.js";
import { appendPromptMemory, renderPromptLayers } from "./prompt/format.js";
import { measurePromptLayers } from "./prompt/metrics.js";
import { buildStaticPromptBlocks } from "./prompt/static.js";
import type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "./prompt/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  AcceptanceState,
  SessionCheckpoint,
  SkillRuntimeState,
  TaskState,
  TodoItem,
  VerificationState,
} from "../types.js";

export type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "./prompt/types.js";
export { appendPromptMemory, renderPromptLayers } from "./prompt/format.js";
export { measurePromptLayers } from "./prompt/metrics.js";

export function buildSystemPromptLayers(
  cwd: string,
  config: RuntimeConfig,
  projectContext: ProjectContext,
  taskState?: TaskState,
  todoItems?: TodoItem[],
  verificationState?: VerificationState,
  runtimeState: PromptRuntimeState = {},
  skillRuntimeState?: SkillRuntimeState,
  checkpoint?: SessionCheckpoint,
  acceptanceState?: AcceptanceState,
): PromptLayers {
  const resolvedSkillRuntimeState = skillRuntimeState ?? createEmptySkillRuntimeState();

  return {
    staticBlocks: buildStaticPromptBlocks({
      config,
      projectContext,
      runtimeState,
    }),
    dynamicBlocks: buildDynamicPromptBlocks({
      cwd,
      config,
      projectContext,
      taskState,
      todoItems,
      verificationState,
      runtimeState,
      skillRuntimeState: resolvedSkillRuntimeState,
      checkpoint,
      acceptanceState,
    }),
  };
}

function createEmptySkillRuntimeState(): SkillRuntimeState {
  return {
    matches: [],
    namedSkills: [],
    applicableSkills: [],
    suggestedSkills: [],
    requiredSkills: [],
    missingRequiredSkills: [],
    loadedSkills: [],
    loadedSkillNames: new Set<string>(),
  };
}
