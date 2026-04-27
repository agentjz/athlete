import type { SessionDiffChange, ToolDiagnosticsReport, ToolExecutionMetadata } from "../../../../types.js";

export function buildToolChangeFeedback(input: {
  toolName: string;
  changeId?: string;
  changedPaths: string[];
  diff: string;
  diagnostics: ToolDiagnosticsReport;
  recordedAt?: string;
}): Pick<ToolExecutionMetadata, "diff" | "diagnostics" | "sessionDiff"> {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const sessionDiff: SessionDiffChange = {
    toolName: input.toolName,
    changeId: input.changeId,
    changedPaths: [...input.changedPaths],
    diff: input.diff,
    diagnosticsStatus: input.diagnostics.status,
    errorCount: input.diagnostics.errorCount,
    warningCount: input.diagnostics.warningCount,
    recordedAt,
  };

  return {
    diff: input.diff,
    diagnostics: input.diagnostics,
    sessionDiff,
  };
}
