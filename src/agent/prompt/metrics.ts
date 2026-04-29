import { renderPromptLayers } from "./format.js";
import type { PromptBlockMetric, PromptLayerMetrics, PromptLayers } from "./types.js";

export function measurePromptLayers(promptLayers: PromptLayers): PromptLayerMetrics {
  const blockMetrics = [
    ...measureBlocks("static", promptLayers.staticBlocks),
    ...measureBlocks("profile", promptLayers.profilePersonaBlocks),
    ...measureBlocks("runtimeFacts", promptLayers.runtimeFactBlocks),
  ];
  const hotspots = [...blockMetrics].sort((left, right) =>
    right.chars - left.chars ||
    right.lines - left.lines ||
    left.title.localeCompare(right.title),
  );
  const renderedChars = renderPromptLayers(promptLayers).length;

  return {
    staticBlockCount: promptLayers.staticBlocks.length,
    profileBlockCount: promptLayers.profilePersonaBlocks.length,
    runtimeFactBlockCount: promptLayers.runtimeFactBlocks.length,
    staticChars: sumChars(promptLayers.staticBlocks),
    profileChars: sumChars(promptLayers.profilePersonaBlocks),
    runtimeFactChars: sumChars(promptLayers.runtimeFactBlocks),
    totalChars: renderedChars,
    renderedChars,
    blockMetrics,
    hotspots,
  };
}

function measureBlocks(
  layer: PromptBlockMetric["layer"],
  blocks: string[],
): PromptBlockMetric[] {
  return blocks.map((block, index) => ({
    layer,
    title: readBlockTitle(block, layer, index),
    chars: block.length,
    lines: block.split(/\r?\n/).length,
  }));
}

function readBlockTitle(
  block: string,
  layer: PromptBlockMetric["layer"],
  index: number,
): string {
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim();
  if (firstLine && firstLine.endsWith(":")) {
    return firstLine.slice(0, -1);
  }

  return `${layer}_${index + 1}`;
}

function sumChars(blocks: string[]): number {
  return blocks.reduce((total, block) => total + block.length, 0);
}
