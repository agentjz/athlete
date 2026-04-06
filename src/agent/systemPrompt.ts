import {
  buildSystemPromptLayers,
  renderPromptLayers,
} from "./promptSections.js";

export type {
  PromptLayers,
  PromptRuntimeState,
} from "./promptSections.js";

export {
  appendPromptMemory,
  buildSystemPromptLayers,
  renderPromptLayers,
} from "./promptSections.js";

export function buildSystemPrompt(...args: Parameters<typeof buildSystemPromptLayers>): string {
  return renderPromptLayers(buildSystemPromptLayers(...args));
}
