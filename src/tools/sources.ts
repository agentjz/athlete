import type { RegisteredTool, ToolRegistrySource } from "./types.js";

export function createToolSource(
  kind: ToolRegistrySource["kind"],
  id: string,
  tools: readonly RegisteredTool[],
): ToolRegistrySource {
  return {
    kind,
    id,
    tools: [...tools],
  };
}
