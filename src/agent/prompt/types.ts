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
  dynamicBlocks: string[];
}

export interface PromptBlockMetric {
  layer: "static" | "dynamic";
  title: string;
  chars: number;
  lines: number;
}

export interface PromptLayerMetrics {
  staticBlockCount: number;
  dynamicBlockCount: number;
  staticChars: number;
  dynamicChars: number;
  totalChars: number;
  renderedChars: number;
  blockMetrics: PromptBlockMetric[];
  hotspots: PromptBlockMetric[];
}
