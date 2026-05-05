import type { RegisteredTool } from "../tools/core/types.js";
import { readTool, writeTool } from "../tools/core/governancePresets.js";
import { bashToolDefinition, editToolDefinition, readToolDefinition, writeToolDefinition } from "./index.js";

export const agentCoreToolCatalog: readonly RegisteredTool[] = [
  withGovernance(readToolDefinition, readTool("filesystem", { concurrencySafe: true })),
  withGovernance(writeToolDefinition, writeTool("filesystem", { changeSignal: "required" })),
  withGovernance(editToolDefinition, writeTool("filesystem", { changeSignal: "required" })),
  withGovernance(bashToolDefinition, writeTool("shell", {
    risk: "high",
    changeSignal: "none",
  })),
];

export function getBuiltinTools(): readonly RegisteredTool[] {
  return agentCoreToolCatalog;
}

export function getBuiltinToolGovernance(name: string): NonNullable<RegisteredTool["governance"]> | undefined {
  return agentCoreToolCatalog.find((tool) => tool.definition.function.name === name)?.governance;
}

function withGovernance(tool: RegisteredTool, governance: NonNullable<RegisteredTool["governance"]>): RegisteredTool {
  return {
    ...tool,
    governance,
    origin: {
      kind: "builtin",
      sourceId: "builtin:core",
    },
  };
}
