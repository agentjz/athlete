import type { PromptRuntimeState } from "../prompt/types.js";
import type { SessionConversationBrief } from "../contextRuntime/sessionBrief/types.js";
import type { AgentWorkingMemory } from "../contextRuntime/workingMemory/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  TaskState,
} from "../../types.js";

export interface AgentProfileBlock {
  title: string;
  content: string;
}

export interface RuntimeFactsProfileInput {
  cwd: string;
  config: RuntimeConfig;
  projectContext: ProjectContext;
  taskState?: TaskState;
  runtimeState: PromptRuntimeState;
  sessionBrief?: SessionConversationBrief;
  workingMemory: AgentWorkingMemory;
  checkpoint?: SessionCheckpoint;
}

export interface AgentRuntimeFactsProfile {
  id: string;
  name: string;
  summary: string;
  buildBlocks(input: RuntimeFactsProfileInput): string[];
}

export interface AgentProfile {
  id: string;
  name: string;
  summary: string;
  personaBlocks: AgentProfileBlock[];
  runtimeFacts: AgentRuntimeFactsProfile;
}
