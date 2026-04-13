import type { AgentIdentity } from "../types.js";
import type { SessionCheckpoint, SessionCheckpointArtifact, SessionCheckpointFlow } from "../../types.js";
import { formatList } from "./shared.js";
import { normalizeCheckpoint } from "./state.js";

export function buildCheckpointContinuationInput(
  identity: AgentIdentity | undefined,
  checkpoint: SessionCheckpoint | undefined,
): string {
  const fallback = buildGenericContinuationInput(identity);
  const normalized = normalizeCheckpoint(checkpoint);

  if (!normalized?.objective) {
    return fallback;
  }

  const subject =
    identity?.kind === "teammate"
      ? "teammate task"
      : identity?.kind === "subagent"
        ? "delegated subtask"
        : "task";
  const lines = [
    `[internal] Resume the current ${subject} from the persisted checkpoint. Continue without restarting.`,
    `Objective: ${normalized.objective}`,
  ];

  if (normalized.completedSteps.length > 0) {
    lines.push(`Completed steps: ${normalized.completedSteps.join(" | ")}`);
  }
  if (normalized.currentStep) {
    lines.push(`Current step: ${normalized.currentStep}`);
  }
  if (normalized.nextStep) {
    lines.push(`Next best step: ${normalized.nextStep}`);
  }
  if (normalized.recentToolBatch?.summary) {
    lines.push(`Recent tool batch: ${normalized.recentToolBatch.summary}`);
  }
  if (normalized.priorityArtifacts.length > 0) {
    lines.push(
      `Priority artifacts: ${normalized.priorityArtifacts
        .slice(0, 3)
        .map(formatArtifactReminder)
        .join(" | ")}`,
    );
  }

  lines.push(
    "Reuse finished work, stored artifacts, previews, and pending paths before calling tools again.",
  );

  return lines.join("\n");
}

export function formatCheckpointBlock(checkpoint: SessionCheckpoint | undefined): string {
  const normalized = normalizeCheckpoint(checkpoint);
  if (!normalized) {
    return "- none";
  }

  return [
    `- Objective: ${normalized.objective ?? "none"}`,
    `- Status: ${normalized.status}`,
    `- Runtime phase: ${formatRuntimePhase(normalized.flow)}`,
    `- Completed steps: ${formatList(normalized.completedSteps)}`,
    `- Current step: ${normalized.currentStep ?? "none"}`,
    `- Next step: ${normalized.nextStep ?? "none"}`,
    `- Recent tool batch: ${normalized.recentToolBatch?.summary ?? "none"}`,
    `- Priority artifacts: ${formatArtifacts(normalized.priorityArtifacts)}`,
    `- Updated at: ${normalized.updatedAt}`,
  ].join("\n");
}

export function buildGenericContinuationInput(identity: AgentIdentity | undefined): string {
  switch (identity?.kind) {
    case "teammate":
      return "[internal] Resume the current teammate task from the latest progress. Continue without restarting.";
    case "subagent":
      return "[internal] Resume the delegated subtask from the latest progress. Continue without restarting.";
    default:
      return "[internal] Resume the current task from the latest progress. Continue without restarting.";
  }
}

function formatRuntimePhase(flow: SessionCheckpointFlow): string {
  const recoveryFailures =
    typeof flow.recoveryFailures === "number" && Number.isFinite(flow.recoveryFailures)
      ? `, failures=${flow.recoveryFailures}`
      : "";

  return flow.reason ? `${flow.phase}${recoveryFailures} (${flow.reason})` : `${flow.phase}${recoveryFailures}`;
}

function formatArtifacts(artifacts: SessionCheckpointArtifact[]): string {
  if (artifacts.length === 0) {
    return "none";
  }

  return artifacts.map(formatArtifactReminder).join(" | ");
}

function formatArtifactReminder(artifact: SessionCheckpointArtifact): string {
  const detail = artifact.storagePath ?? artifact.path ?? artifact.label;
  return `${artifact.kind}: ${detail}`;
}
