import type { AgentIdentity } from "../types.js";

export interface PromptRuntimeState {
  identity?: AgentIdentity;
  taskSummary?: string;
  teamSummary?: string;
  worktreeSummary?: string;
  backgroundSummary?: string;
  protocolSummary?: string;
  coordinationPolicySummary?: string;
  capabilitySummary?: string;
}

export interface PromptLayers {
  staticBlocks: string[];
  profilePersonaBlocks: string[];
  runtimeFactBlocks: string[];
}

export interface PromptBlockMetric {
  layer: "static" | "profile" | "runtimeFacts";
  title: string;
  chars: number;
  lines: number;
}

export interface PromptLayerMetrics {
  staticBlockCount: number;
  profileBlockCount: number;
  runtimeFactBlockCount: number;
  staticChars: number;
  profileChars: number;
  runtimeFactChars: number;
  totalChars: number;
  renderedChars: number;
  blockMetrics: PromptBlockMetric[];
  hotspots: PromptBlockMetric[];
}
