import type { ProviderMessage } from "../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "../prompt/types.js";
import type { SessionConversationBrief } from "./sessionBrief/types.js";
import type { AgentWorkingMemory } from "./workingMemory/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  SessionCheckpoint,
  SessionRecord,
  TaskState,
} from "../../types.js";

export interface ContextRuntimeToolProgress {
  iteration: number;
  softToolLimit: number;
  continuationWindow: number;
  yieldAfterToolSteps?: number;
  shouldYield: boolean;
}

export interface ContextRuntimeSnapshot {
  sessionBrief?: SessionConversationBrief;
  workingMemory: AgentWorkingMemory;
  historyBoundary: {
    rawHistoryPolicy: "evidence_lookup_only";
    automaticSurfaces: string[];
  };
  toolProgress?: ContextRuntimeToolProgress;
}

export interface BuildContextRuntimeSnapshotInput {
  session: Pick<
    SessionRecord,
    "messages" | "taskState" | "checkpoint"
  >;
  toolProgress?: ContextRuntimeToolProgress;
}

export interface BuildContextRuntimePromptLayersInput {
  cwd: string;
  config: RuntimeConfig;
  projectContext: ProjectContext;
  taskState?: TaskState;
  runtimeState?: PromptRuntimeState;
  checkpoint?: SessionCheckpoint;
  messages?: SessionRecord["messages"];
}

export interface ContextRuntimeRequestInput {
  prompt: string | PromptLayers;
  session: Pick<SessionRecord, "messages">;
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars">;
}

export interface ContextRuntimeRequest {
  messages: ProviderMessage[];
  compressed: boolean;
  estimatedChars: number;
  summary?: string;
  promptMetrics?: PromptLayerMetrics;
}
