import type { PromptRuntimeState } from "../prompt/types.js";
import type {
  AcceptanceState,
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  SkillRuntimeState,
  TaskState,
  VerificationState,
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
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  runtimeState: PromptRuntimeState;
  skillRuntimeState: SkillRuntimeState;
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
