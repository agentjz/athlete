import { createCapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";

export function getBackgroundCapabilityPackage(): CapabilityPackage {
  const profile = createCapabilityProfile({
    kind: "background",
    id: "background.command",
    name: "Lead-selected background command",
    description: "A background execution is a machine-run command selected by Lead for durable non-blocking work.",
    bestFor: ["long-running commands", "non-blocking local processes", "durable command observation"],
    notFor: ["automatic shell execution", "strategy decisions", "final closeout without Lead review"],
    inputSchema: "AssignmentContract plus explicit background_run tool arguments",
    outputSchema: "Execution record, progress/output artifacts, CloseoutContract, and WakeSignal",
    budgetPolicy: "High cost when long-running; Lead chooses timeout and whether background execution is worth it.",
    tools: ["background_run", "background_check", "background_terminate"],
    cost: "high",
    extensionPoint: "src/execution/background.ts",
  });

  return createCapabilityPackage({
    profile,
    source: {
      kind: "background",
      id: "background.command",
      path: "src/execution/background.ts",
      builtIn: true,
    },
    adapter: {
      kind: "background",
      id: "background.command.adapter",
      description: "Adapts Lead-selected background command execution into the generic capability package contract.",
    },
    runnerType: "background",
    availability: "Durable background command execution with progress and execution-state reporting.",
  });
}
