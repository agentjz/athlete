import type { AgentIdentity } from "../types.js";
import type { SessionCheckpoint, SessionCheckpointArtifact } from "../../types.js";
import { buildContinuationDiligenceReminder } from "../prompt/diligence.js";
import { normalizeCheckpoint } from "./state.js";

export function buildCheckpointContinuationInput(
  identity: AgentIdentity | undefined,
  checkpoint: SessionCheckpoint | undefined,
): string {
  /*
  中文翻译：
  - [内部] 从已持久化的 checkpoint 恢复当前任务。继续推进，不要重新开始。
  - 目标：{objective}
  - 已完成步骤：{completedSteps}
  - 当前步骤：{currentStep}
  - 下一步最佳动作：{nextStep}
  - 最近工具批次：{summary}
  - 优先工件：{artifacts}
  - 在再次调用工具之前，复用已完成工作、已存储工件、预览和待续路径。
  */
  const fallback = buildGenericContinuationInput(identity);
  const normalized = normalizeCheckpoint(checkpoint);

  if (!normalized?.objective || normalized.status === "completed") {
    return fallback;
  }

  const subject =
    identity?.kind === "teammate"
      ? "teammate task"
      : identity?.kind === "subagent"
        ? "delegated subtask"
        : "task";
  const lines = [
    `[internal] Resume the current ${subject} from the latest progress. Continue without restarting.`,
    buildContinuationDiligenceReminder(),
  ];

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
    "Use this as a short route marker only; inspect files or tools for details when needed.",
  );

  return lines.join("\n");
}

export function buildGenericContinuationInput(identity: AgentIdentity | undefined): string {
  /*
  中文翻译：
  - [内部] 从最新进度恢复当前 teammate 任务。继续推进，不要重新开始。
  - [内部] 从最新进度恢复当前被委派的子任务。继续推进，不要重新开始。
  - [内部] 从最新进度恢复当前任务。继续推进，不要重新开始。
  */
  switch (identity?.kind) {
    case "teammate":
      return [
        "[internal] Resume the current teammate task from the latest progress. Continue without restarting.",
        buildContinuationDiligenceReminder(),
      ].join("\n");
    case "subagent":
      return [
        "[internal] Resume the delegated subtask from the latest progress. Continue without restarting.",
        buildContinuationDiligenceReminder(),
      ].join("\n");
    default:
      return [
        "[internal] Resume the current task from the latest progress. Continue without restarting.",
        buildContinuationDiligenceReminder(),
      ].join("\n");
  }
}

function formatArtifactReminder(artifact: SessionCheckpointArtifact): string {
  const detail = artifact.storagePath ?? artifact.path ?? artifact.label;
  return `${artifact.kind}: ${detail}`;
}
