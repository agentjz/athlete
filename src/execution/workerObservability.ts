import { recordObservabilityEvent } from "../observability/writer.js";
import type { ExecutionRecord } from "./types.js";

export async function recordExecutionStarted(
  rootDir: string,
  execution: ExecutionRecord,
  overrides: {
    sessionId?: string;
    cwd?: string;
    worktreeName?: string;
  } = {},
): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "execution.lifecycle",
    status: "started",
    executionId: execution.id,
    identityKind: execution.profile,
    identityName: execution.actorName,
    details: {
      lane: execution.lane,
      profile: execution.profile,
      actorName: execution.actorName,
      actorRole: execution.actorRole,
      taskId: execution.taskId,
      worktreeName: overrides.worktreeName ?? execution.worktreeName,
      sessionId: overrides.sessionId ?? execution.sessionId,
      cwd: overrides.cwd ?? execution.cwd,
    },
  });
}
