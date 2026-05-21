import { createCapabilityProfile } from "../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../protocol/package.js";
import { getExtensionDefinition } from "./definitions.js";
import type { ExtensionRegistryEntry, ExtensionRegistrySnapshot } from "./registry.js";

export function listExtensionCapabilityPackages(registry: ExtensionRegistrySnapshot): CapabilityPackage[] {
  return registry.entries
    .filter((entry) => entry.enabled)
    .map(createExtensionCapabilityPackage);
}

function createExtensionCapabilityPackage(entry: ExtensionRegistryEntry): CapabilityPackage {
  const definition = getExtensionDefinition(entry.id);
  const toolNames = entry.tools.map((tool) => tool.definition.function.name).sort();
  const profile = createCapabilityProfile({
    kind: "extension",
    id: `extension.${entry.id}`,
    name: `${entry.id} extension`,
    description: definition.capability.description,
    bestFor: definition.capability.bestFor,
    notFor: [
      "automatic strategy selection",
      "machine-owned planning decisions",
      "bypassing the current runtime tool boundary",
    ],
    inputSchema: "Tool call arguments selected by the lead agent",
    outputSchema: "ToolExecutionResult with optional changedPaths evidence",
    budgetPolicy: "Extension tools are explicit lead-selected operations. Runtime does not auto-dispatch them.",
    tools: toolNames,
    cost: definition.capability.cost,
    extensionPoint: `src/extensions/tools/${entry.id}`,
  });
  return createCapabilityPackage({
    packageId: profile.id,
    profile,
    source: {
      kind: "extension",
      id: entry.id,
      builtIn: true,
    },
    adapter: {
      kind: "extension",
      id: `${profile.id}.adapter`,
      description: "Adapts a Kitty extension tool collection into a capability package.",
    },
    availability: `${entry.id} extension is enabled and exposes ${toolNames.length} tool(s).`,
    useWhen: definition.capability.bestFor,
    avoidWhen: profile.notFor,
    port: {
      runner: {
        type: "tool",
        invocation: "Lead emits explicit tool calls; runtime validates arguments and executes through the tool registry.",
        createsExecution: false,
        emitsProgress: false,
        emitsArtifacts: true,
        emitsCloseout: false,
        emitsWakeSignal: false,
      },
      permissionBoundary: {
        world: `${entry.id} extension lane`,
        autonomy: "Extension tools own only declared machine operations. Product judgment remains with the lead agent.",
        read: [`${entry.id} tool inputs`, "project state needed by the selected tool"],
        write: [`${entry.id} state or declared changed paths`, "tool result evidence"],
        forbidden: [
          "automatic route changes",
          "model strategy decisions",
          "hidden compatibility aliases",
        ],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "tool",
        streams: ["tool", "result"],
      },
      artifacts: [
        {
          kind: "observation",
          name: `${entry.id}-tool-result`,
          description: `Result evidence from ${entry.id} extension tools.`,
          required: false,
        },
      ],
      closeout: {
        required: false,
        contract: "CloseoutContract",
        requiredEvidence: [],
        mergeProposal: "none",
      },
      wake: {
        required: false,
        reasons: [],
      },
    },
  });
}
