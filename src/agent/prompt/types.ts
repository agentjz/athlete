import type { AgentIdentity } from "../types.js";

export interface PromptRuntimeState {
  identity?: AgentIdentity;
  taskSummary?: string;
  teamSummary?: string;
  worktreeSummary?: string;
  backgroundSummary?: string;
  protocolSummary?: string;
  coordinationPolicySummary?: string;
}

export interface PromptLayers {
  staticBlocks: string[];
  dynamicBlocks: string[];
  memoryBlocks?: string[];
}

export interface PromptBlockMetric {
  layer: "static" | "dynamic" | "memory";
  title: string;
  chars: number;
  lines: number;
}

export interface PromptLayerMetrics {
  staticBlockCount: number;
  dynamicBlockCount: number;
  memoryBlockCount: number;
  staticChars: number;
  dynamicChars: number;
  memoryChars: number;
  totalChars: number;
  renderedChars: number;
  blockMetrics: PromptBlockMetric[];
  hotspots: PromptBlockMetric[];
}
