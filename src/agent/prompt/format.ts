import type { PromptLayers } from "./types.js";

export function formatPromptBlock(title: string, content: string): string {
  return `${title}:\n${content}`;
}

export function appendPromptMemory(
  promptLayers: PromptLayers,
  summary: string | undefined,
): PromptLayers {
  if (!summary) {
    return promptLayers;
  }

  return {
    ...promptLayers,
    memoryBlocks: [...(promptLayers.memoryBlocks ?? []), summary],
  };
}

export function renderPromptLayers(promptLayers: PromptLayers): string {
  const sections = [
    "Static operating layer:",
    joinBlocks(promptLayers.staticBlocks),
    "",
    "Dynamic runtime layer:",
    joinBlocks(promptLayers.dynamicBlocks),
  ];

  if ((promptLayers.memoryBlocks ?? []).length > 0) {
    sections.push("", "Compressed conversation memory:", joinBlocks(promptLayers.memoryBlocks ?? []));
  }

  return sections.join("\n").trim();
}

export function joinBlocks(blocks: string[]): string {
  return blocks.filter((block) => block.trim().length > 0).join("\n\n");
}
