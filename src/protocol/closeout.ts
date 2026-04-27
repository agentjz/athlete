export const CLOSEOUT_PROTOCOL = "deadmouse.closeout.v1" as const;

export type CloseoutStatus = "done" | "failed" | "blocked" | "budget_exhausted";

export const CLOSEOUT_FIELDS = [
  "status",
  "summary",
  "evidence",
  "changed_paths",
  "verification",
  "risks",
  "next_suggestion",
] as const;

export type CloseoutField = typeof CLOSEOUT_FIELDS[number];

export interface CloseoutContract {
  protocol: typeof CLOSEOUT_PROTOCOL;
  executionId?: string;
  assignmentId?: string;
  status: CloseoutStatus;
  summary: string;
  evidence: readonly string[];
  changedPaths: readonly string[];
  verification: readonly string[];
  risks: readonly string[];
  nextSuggestion: string;
  createdAt: string;
}

export function createCloseoutContract(input: {
  executionId?: string;
  assignmentId?: string;
  status: CloseoutStatus;
  summary: string;
  evidence?: readonly string[];
  changedPaths?: readonly string[];
  verification?: readonly string[];
  risks?: readonly string[];
  nextSuggestion?: string;
  createdAt?: string;
}): CloseoutContract {
  return {
    protocol: CLOSEOUT_PROTOCOL,
    executionId: input.executionId,
    assignmentId: input.assignmentId,
    status: input.status,
    summary: input.summary.trim() || "No summary reported.",
    evidence: [...(input.evidence ?? [])],
    changedPaths: [...(input.changedPaths ?? [])],
    verification: [...(input.verification ?? [])],
    risks: [...(input.risks ?? [])],
    nextSuggestion: input.nextSuggestion?.trim() || "Lead should review the closeout and decide the next action.",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function formatCloseoutInstruction(): string {
  return [
    `<closeout-contract protocol="${CLOSEOUT_PROTOCOL}">`,
    "Return a compact handoff for Lead using exactly this shape:",
    "status: done | failed | blocked | budget_exhausted",
    "summary: what you did or where you stopped",
    "evidence: concrete files, commands, observations, records, or artifact refs",
    "changed_paths: changed files, or none",
    "verification: checks run and outcomes, or why not run",
    "risks: blockers, uncertainty, or none known",
    "next_suggestion: the next decision Lead should consider",
    "</closeout-contract>",
  ].join("\n");
}

export function normalizeCloseoutText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return formatCloseoutContract(createCloseoutContract({
      status: "blocked",
      summary: "Execution returned no final handoff text.",
      evidence: ["none reported"],
      risks: ["missing closeout text"],
      nextSuggestion: "Lead should inspect execution state before deciding whether to continue.",
    }));
  }

  return hasCloseoutFieldLabels(trimmed)
    ? trimmed
    : formatCloseoutContract(createCloseoutContract({
        status: "blocked",
        summary: "Execution returned unstructured handoff text.",
        evidence: [trimmed],
        risks: ["handoff did not follow CloseoutContract"],
        nextSuggestion: "Lead should review this unstructured handoff and decide the next action.",
      }));
}

export function formatCloseoutContract(contract: CloseoutContract): string {
  return [
    `protocol: ${contract.protocol}`,
    contract.executionId ? `execution_id: ${contract.executionId}` : undefined,
    contract.assignmentId ? `assignment_id: ${contract.assignmentId}` : undefined,
    `status: ${contract.status}`,
    `summary: ${contract.summary}`,
    `evidence: ${formatItems(contract.evidence)}`,
    `changed_paths: ${formatItems(contract.changedPaths)}`,
    `verification: ${formatItems(contract.verification)}`,
    `risks: ${formatItems(contract.risks)}`,
    `next_suggestion: ${contract.nextSuggestion}`,
    `created_at: ${contract.createdAt}`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function hasCloseoutFieldLabels(text: string): boolean {
  const lower = text.toLowerCase();
  return CLOSEOUT_FIELDS.filter((field) => lower.includes(`${field}:`)).length >= 4;
}

function formatItems(items: readonly string[]): string {
  return items.length > 0 ? items.join("; ") : "none";
}
