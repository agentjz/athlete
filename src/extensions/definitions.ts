import type { CapabilityCost } from "../protocol/capability.js";
import type { RegisteredTool } from "../tools/core/types.js";
import { createNetworkTools } from "./tools/network/index.js";
import { createSpecTools } from "./tools/spec/index.js";
import { createTodoTools } from "./tools/todo/index.js";
import { createWorktreeTools } from "./tools/worktree/index.js";

export interface ExtensionDefinition {
  id: string;
  defaultEnabled: boolean;
  summary: string;
  createTools: () => readonly RegisteredTool[];
  capability: {
    description: string;
    bestFor: readonly string[];
    cost: CapabilityCost;
  };
}

export const EXTENSION_DEFINITIONS = [
  {
    id: "todo",
    defaultEnabled: true,
    summary: "Session todo writing and visible checklist preview.",
    createTools: createTodoTools,
    capability: {
      description: "Session-level todo checklist writing and visible progress preview.",
      bestFor: [
        "maintaining current session checklist state",
        "showing concise progress preview",
      ],
      cost: "low",
    },
  },
  {
    id: "worktree",
    defaultEnabled: true,
    summary: "Git worktree discovery and lifecycle management.",
    createTools: createWorktreeTools,
    capability: {
      description: "Git worktree discovery and lifecycle management.",
      bestFor: [
        "inspecting git worktrees",
        "creating and removing explicit worktree paths",
      ],
      cost: "medium",
    },
  },
  {
    id: "network",
    defaultEnabled: true,
    summary: "HTTP session, request, probe, download, trace, and OpenAPI tools.",
    createTools: createNetworkTools,
    capability: {
      description: "HTTP session, request, probe, suite, download, trace, and OpenAPI inspection tools.",
      bestFor: [
        "probing HTTP services",
        "running structured HTTP request suites",
        "recording network evidence",
      ],
      cost: "medium",
    },
  },
  {
    id: "spec",
    defaultEnabled: false,
    summary: "Durable spec documents, workflow state, checkpoints, and isolated worktree support.",
    createTools: createSpecTools,
    capability: {
      description: "Durable spec documents, workflow state, checkpoints, and isolated worktree support.",
      bestFor: [
        "requirements/design/tasks workflow",
        "durable spec review",
        "checkpointed spec implementation",
      ],
      cost: "medium",
    },
  },
] as const satisfies readonly ExtensionDefinition[];

export type ExtensionId = (typeof EXTENSION_DEFINITIONS)[number]["id"];

export const EXTENSION_IDS = EXTENSION_DEFINITIONS.map((definition) => definition.id) as ExtensionId[];

export function getExtensionDefinition(id: ExtensionId): (typeof EXTENSION_DEFINITIONS)[number] {
  return EXTENSION_DEFINITIONS.find((definition) => definition.id === id) ?? missingExtensionDefinition(id);
}

function missingExtensionDefinition(id: ExtensionId): never {
  throw new Error(`Unknown extension definition: ${String(id)}`);
}
