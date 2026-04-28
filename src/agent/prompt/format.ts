import type { PromptLayers } from "./types.js";

export function formatPromptBlock(title: string, content: string): string {
  return `${title}:\n${content}`;
}

export function renderPromptLayers(promptLayers: PromptLayers): string {
  const sections = [
    "Static operating layer:",
    joinBlocks(promptLayers.staticBlocks),
    "",
    "Dynamic runtime layer:",
    joinBlocks(promptLayers.dynamicBlocks),
  ];

  return sections.join("\n").trim();
}

export function joinBlocks(blocks: string[]): string {
  return blocks.filter((block) => block.trim().length > 0).join("\n\n");
}
