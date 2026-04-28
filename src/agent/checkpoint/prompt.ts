import type { AgentIdentity } from "../types.js";

export function buildInternalWakeInput(
  identity: AgentIdentity | undefined,
): string {
  const subject =
    identity?.kind === "teammate"
      ? "teammate runtime"
      : identity?.kind === "subagent"
        ? "subagent runtime"
        : "lead runtime";
  const lines = [
    `[internal] Wake ${subject}; runtime state changed. This is not a user objective.`,
    "Keep the latest real user input as the current objective.",
  ];

  return lines.join("\n");
}
