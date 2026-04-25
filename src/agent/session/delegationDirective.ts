export type DelegationDirectiveSource = "none" | "user_prefix";

export interface DelegationDirective {
  teammate: boolean;
  subagent: boolean;
  source: DelegationDirectiveSource;
}

export interface ParsedDelegationDirective {
  directive: DelegationDirective;
  input: string;
}

const NONE: DelegationDirective = {
  teammate: false,
  subagent: false,
  source: "none",
};

export function parseDelegationDirective(input: string | null | undefined): ParsedDelegationDirective {
  const text = String(input ?? "").trim();
  const match = text.match(/^\/(team\/subagent|team|subagent)(?:\s+|$)([\s\S]*)$/i);
  if (!match) {
    return {
      directive: NONE,
      input: text,
    };
  }

  const prefix = match[1]!.toLowerCase();
  return {
    directive: {
      teammate: prefix === "team" || prefix === "team/subagent",
      subagent: prefix === "subagent" || prefix === "team/subagent",
      source: "user_prefix",
    },
    input: String(match[2] ?? "").trim(),
  };
}

export function normalizeDelegationDirective(value: unknown): DelegationDirective {
  if (!value || typeof value !== "object") {
    return NONE;
  }

  const record = value as Partial<DelegationDirective>;
  return {
    teammate: Boolean(record.teammate),
    subagent: Boolean(record.subagent),
    source: record.source === "user_prefix" ? "user_prefix" : "none",
  };
}

export function hasDelegationDirective(directive: DelegationDirective | undefined): boolean {
  const normalized = normalizeDelegationDirective(directive);
  return normalized.teammate || normalized.subagent;
}
