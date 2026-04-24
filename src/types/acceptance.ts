export type AcceptanceContractKind = "generic" | "research" | "document" | "product";

export type AcceptanceFileRole = "deliverable" | "source";

export type AcceptanceFileFormat = "text" | "json" | "binary";

export interface AcceptanceFileRequirement {
  path: string;
  role?: AcceptanceFileRole;
  format?: AcceptanceFileFormat;
  minItems?: number;
  requiredRecordFields?: string[];
  mustContain?: string[];
}

export interface AcceptanceCommandRequirement {
  id: string;
  commandContains: string;
}

export interface AcceptanceHttpRequirement {
  id: string;
  url: string;
  status?: number;
  bodyContains?: string[];
}

export interface AcceptanceContract {
  kind: AcceptanceContractKind;
  summary?: string;
  requiredFiles: AcceptanceFileRequirement[];
  commandChecks: AcceptanceCommandRequirement[];
  httpChecks: AcceptanceHttpRequirement[];
}

export type AcceptanceStatus = "idle" | "active" | "satisfied";

export interface AcceptanceState {
  status: AcceptanceStatus;
  contract?: AcceptanceContract;
  currentPhase?: string;
  stalledPhaseCount: number;
  completedChecks: string[];
  pendingChecks: string[];
  lastIssueSummary?: string;
  updatedAt: string;
}
