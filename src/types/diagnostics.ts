export interface ToolDiagnosticItem {
  source: string;
  severity: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface ToolDiagnosticFileReport {
  path: string;
  errorCount: number;
  warningCount: number;
  diagnostics: ToolDiagnosticItem[];
}

export interface ToolDiagnosticsReport {
  status: "clean" | "issues" | "unavailable";
  errorCount: number;
  warningCount: number;
  files: ToolDiagnosticFileReport[];
  error?: string;
}
