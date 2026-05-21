import type { RegisteredTool } from "../tools/core/types.js";
import { bashToolDefinition, editToolDefinition, readToolDefinition, writeToolDefinition } from "./index.js";

export const agentCoreToolCatalog: readonly RegisteredTool[] = [
  withChangeSignal(readToolDefinition, "none"),
  withChangeSignal(writeToolDefinition, "required"),
  withChangeSignal(editToolDefinition, "required"),
  withChangeSignal(bashToolDefinition, "none"),
];

export function getBuiltinTools(): readonly RegisteredTool[] {
  return agentCoreToolCatalog;
}

export function getBuiltinToolNames(): string[] {
  return getBuiltinTools().map((tool) => tool.definition.function.name);
}

function withChangeSignal(
  tool: RegisteredTool,
  changeSignal: NonNullable<RegisteredTool["changeSignal"]>,
): RegisteredTool {
  return {
    ...tool,
    changeSignal,
    origin: {
      kind: "builtin",
      sourceId: "builtin:core",
    },
  };
}
