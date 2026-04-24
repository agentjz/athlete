import {
  buildSystemPromptLayers,
  renderPromptLayers,
} from "./promptSections.js";

export type {
  PromptLayerMetrics,
  PromptLayers,
  PromptRuntimeState,
} from "./promptSections.js";

export {
  appendPromptMemory,
  buildSystemPromptLayers,
  measurePromptLayers,
  renderPromptLayers,
} from "./promptSections.js";

export function buildSystemPrompt(...args: Parameters<typeof buildSystemPromptLayers>): string {
  return renderPromptLayers(buildSystemPromptLayers(...args));
}
