import fs from "node:fs/promises";
import path from "node:path";

import type { ToolDiagnosticFileReport, ToolDiagnosticItem, ToolDiagnosticsReport } from "../../types.js";

const TYPE_SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export async function collectWriteDiagnostics(paths: string[]): Promise<ToolDiagnosticsReport> {
  const uniquePaths = takeUniquePaths(paths);
  if (uniquePaths.length === 0) {
    return createEmptyDiagnosticsReport("clean");
  }

  const reports: ToolDiagnosticFileReport[] = [];
  let unavailableError: string | undefined;

  for (const targetPath of uniquePaths) {
    try {
      const report = await collectFileDiagnostics(targetPath);
      if (report) {
        reports.push(report);
      }
    } catch (error) {
      unavailableError = error instanceof Error ? error.message : String(error);
    }
  }

  if (unavailableError) {
    return {
      status: "unavailable",
      errorCount: 0,
      warningCount: 0,
      files: reports,
      error: unavailableError,
    };
  }

  const errorCount = reports.reduce((total, report) => total + report.errorCount, 0);
  const warningCount = reports.reduce((total, report) => total + report.warningCount, 0);
  return {
    status: errorCount > 0 || warningCount > 0 ? "issues" : "clean",
    errorCount,
    warningCount,
    files: reports,
  };
}

function createEmptyDiagnosticsReport(status: ToolDiagnosticsReport["status"]): ToolDiagnosticsReport {
  return {
    status,
    errorCount: 0,
    warningCount: 0,
    files: [],
  };
}

async function collectFileDiagnostics(targetPath: string): Promise<ToolDiagnosticFileReport | null> {
  try {
    const extension = path.extname(targetPath).toLowerCase();
    if (extension === ".json") {
      return await collectJsonDiagnostics(targetPath);
    }

    if (TYPE_SCRIPT_EXTENSIONS.has(extension)) {
      return await collectTypeScriptDiagnostics(targetPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  return null;
}

async function collectJsonDiagnostics(targetPath: string): Promise<ToolDiagnosticFileReport> {
  const content = await fs.readFile(targetPath, "utf8");
  const diagnostics: ToolDiagnosticItem[] = [];

  try {
    JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = readJsonErrorPosition(message);
    const location = typeof position === "number" ? positionToLineColumn(content, position) : undefined;

    diagnostics.push({
      source: "json",
      severity: "error",
      message,
      line: location?.line,
      column: location?.column,
    });
  }

  return buildDiagnosticsFileReport(targetPath, diagnostics);
}

async function collectTypeScriptDiagnostics(targetPath: string): Promise<ToolDiagnosticFileReport> {
  const diagnostics: ToolDiagnosticItem[] = [];
  const TypeScript = await import("typescript");
  const content = await fs.readFile(targetPath, "utf8");
  const transpiled = TypeScript.transpileModule(content, {
    fileName: targetPath,
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      target: TypeScript.ScriptTarget.ES2022,
      module: TypeScript.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });

  for (const diagnostic of transpiled.diagnostics ?? []) {
    const flattened = TypeScript.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const location = diagnostic.start !== undefined
      ? TypeScript.getLineAndCharacterOfPosition(
          diagnostic.file ?? TypeScript.createSourceFile(targetPath, content, TypeScript.ScriptTarget.ES2022, true),
          diagnostic.start,
        )
      : undefined;

    diagnostics.push({
      source: "typescript",
      severity: diagnostic.category === TypeScript.DiagnosticCategory.Warning ? "warning" : "error",
      message: flattened,
      line: location ? location.line + 1 : undefined,
      column: location ? location.character + 1 : undefined,
      code: typeof diagnostic.code === "number" ? `TS${diagnostic.code}` : undefined,
    });
  }

  return buildDiagnosticsFileReport(targetPath, diagnostics);
}

function buildDiagnosticsFileReport(
  targetPath: string,
  diagnostics: ToolDiagnosticItem[],
): ToolDiagnosticFileReport {
  return {
    path: targetPath,
    errorCount: diagnostics.filter((item) => item.severity === "error").length,
    warningCount: diagnostics.filter((item) => item.severity === "warning").length,
    diagnostics,
  };
}

function readJsonErrorPosition(message: string): number | undefined {
  const match = message.match(/\bposition\s+(\d+)\b/i);
  if (!match) {
    return undefined;
  }

  const position = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(position) && position >= 0 ? position : undefined;
}

function positionToLineColumn(content: string, position: number): {
  line: number;
  column: number;
} {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const slice = content.slice(0, safePosition);
  const lines = slice.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1] ?? "").length + 1,
  };
}

function takeUniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const targetPath of paths) {
    if (!targetPath || seen.has(targetPath)) {
      continue;
    }

    seen.add(targetPath);
    result.push(targetPath);
  }

  return result;
}
