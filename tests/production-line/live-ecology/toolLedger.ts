import fs from "node:fs/promises";
import path from "node:path";

export type LiveEcologyToolReportStatus = "called" | "failed" | "skipped" | "not_called";

export interface LiveEcologyToolReportEntry {
  tool: string;
  status: LiveEcologyToolReportStatus;
  failureClass?: "model_invocation_mistake" | "tool_execution_failure" | "not_applicable";
  evidencePath?: string;
  summary?: string;
}

export interface LiveEcologyToolReportReadResult {
  reportPath: string;
  entries: LiveEcologyToolReportEntry[];
  reportedTools: string[];
  unreportedTools: string[];
  problems: string[];
}

export function getToolLedgerReportPath(groupDir: string): string {
  return path.join(groupDir, "live-ecology-tool-report.json");
}

export function buildToolLedgerPrompt(groupDir: string, expectedTools: readonly string[]): string {
  const reportPath = getToolLedgerReportPath(groupDir);
  const checklist = expectedTools.map((tool, index) => `${index + 1}. ${tool}`).join("\n");
  return [
    "Machine-generated execution ledger:",
    checklist,
    `You must create ${reportPath} before final closeout.`,
    "The report must be valid JSON with this exact shape:",
    '{"tools":[{"tool":"tool_name","status":"called|failed|skipped|not_called","failureClass":"model_invocation_mistake|tool_execution_failure|not_applicable","evidencePath":"path or empty","summary":"Simplified Chinese one-sentence summary"}]}',
    "Every expected tool must appear exactly once in that JSON report.",
    "Run the tools one by one against this ledger; do not rely on memory, and do not final-close until every ledger item is marked.",
  ].join(" ");
}

export async function readToolLedgerReport(
  groupDir: string,
  expectedTools: readonly string[],
): Promise<LiveEcologyToolReportReadResult> {
  const reportPath = getToolLedgerReportPath(groupDir);
  const raw = await fs.readFile(reportPath, "utf8").catch(() => "");
  if (!raw) {
    return {
      reportPath,
      entries: [],
      reportedTools: [],
      unreportedTools: [...expectedTools],
      problems: [`Missing tool ledger report: ${reportPath}`],
    };
  }

  const parsed = safeParseRecord(raw);
  const toolsValue = parsed?.tools;
  if (!Array.isArray(toolsValue)) {
    return {
      reportPath,
      entries: [],
      reportedTools: [],
      unreportedTools: [...expectedTools],
      problems: ["Tool ledger report must contain a tools array."],
    };
  }

  const problems: string[] = [];
  const entries: LiveEcologyToolReportEntry[] = [];
  const expected = new Set(expectedTools);
  const reported = new Set<string>();
  for (const item of toolsValue) {
    const entry = normalizeReportEntry(item);
    if (!entry) {
      problems.push("Tool ledger report contains an invalid entry.");
      continue;
    }
    if (!expected.has(entry.tool)) {
      problems.push(`Unexpected tool in ledger report: ${entry.tool}`);
      continue;
    }
    if (reported.has(entry.tool)) {
      problems.push(`Duplicate tool in ledger report: ${entry.tool}`);
    }
    reported.add(entry.tool);
    entries.push(entry);
  }

  const unreportedTools = expectedTools.filter((tool) => !reported.has(tool));
  return {
    reportPath,
    entries,
    reportedTools: [...reported].sort(),
    unreportedTools,
    problems,
  };
}

function normalizeReportEntry(value: unknown): LiveEcologyToolReportEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const tool = typeof record.tool === "string" ? record.tool.trim() : "";
  const status = normalizeStatus(record.status);
  if (!tool || !status) {
    return null;
  }
  return {
    tool,
    status,
    failureClass: normalizeFailureClass(record.failureClass),
    evidencePath: typeof record.evidencePath === "string" ? record.evidencePath : undefined,
    summary: typeof record.summary === "string" ? record.summary : undefined,
  };
}

function normalizeStatus(value: unknown): LiveEcologyToolReportStatus | null {
  switch (value) {
    case "called":
    case "failed":
    case "skipped":
    case "not_called":
      return value;
    default:
      return null;
  }
}

function normalizeFailureClass(value: unknown): LiveEcologyToolReportEntry["failureClass"] | undefined {
  switch (value) {
    case "model_invocation_mistake":
    case "tool_execution_failure":
    case "not_applicable":
      return value;
    default:
      return undefined;
  }
}

function safeParseRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
