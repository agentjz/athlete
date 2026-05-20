import { createNetworkTools } from "./tools/network/index.js";
import { createSpecTools } from "./tools/spec/index.js";
import { createTodoTools } from "./tools/todo/index.js";
import { createWorktreeTools } from "./tools/worktree/index.js";
import type { RegisteredTool } from "../tools/core/types.js";
import type { RuntimeConfig } from "../types.js";

export interface ExtensionRegistryEntry {
  id: "todo" | "worktree" | "network" | "spec";
  enabled: boolean;
  tools: readonly RegisteredTool[];
}

export interface ExtensionRegistrySnapshot {
  entries: ExtensionRegistryEntry[];
}

export function createExtensionRegistry(config: RuntimeConfig): ExtensionRegistrySnapshot {
  return {
    entries: [
      createEntry("todo", config),
      createEntry("worktree", config),
      createEntry("network", config),
      createEntry("spec", config),
    ],
  };
}

function createEntry(
  id: ExtensionRegistryEntry["id"],
  config: RuntimeConfig,
): ExtensionRegistryEntry {
  return {
    id,
    enabled: config.extensions[id],
    tools: config.extensions[id] ? createExtensionTools(id) : [],
  };
}

function createExtensionTools(id: ExtensionRegistryEntry["id"]): readonly RegisteredTool[] {
  switch (id) {
    case "todo":
      return createTodoTools();
    case "worktree":
      return createWorktreeTools();
    case "network":
      return createNetworkTools();
    case "spec":
      return createSpecTools();
  }
}
