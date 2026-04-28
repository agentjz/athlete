import { readUserInput } from "../session/turnFrame.js";
import type {
  AcceptanceCommandRequirement,
  AcceptanceContract,
  AcceptanceFileRequirement,
  AcceptanceHttpRequirement,
  AcceptanceState,
  StoredMessage,
} from "../../types.js";

const ACCEPTANCE_CONTRACT_PATTERN = /<acceptance_contract>\s*([\s\S]*?)\s*<\/acceptance_contract>/i;

export function deriveAcceptanceState(
  messages: StoredMessage[],
  previous?: AcceptanceState,
  timestamp = new Date().toISOString(),
): AcceptanceState | undefined {
  const contract = findAcceptanceContract(messages) ?? previous?.contract;
  if (!contract) {
    return undefined;
  }

  return normalizeAcceptanceState(
    {
      status: previous?.status ?? "active",
      contract,
      currentPhase: previous?.currentPhase,
      stalledPhaseCount: previous?.stalledPhaseCount ?? 0,
      completedChecks: previous?.completedChecks ?? [],
      pendingChecks: previous?.pendingChecks ?? [],
      lastIssueSummary: previous?.lastIssueSummary,
      updatedAt: timestamp,
    },
    timestamp,
  );
}

export function normalizeAcceptanceState(
  state: AcceptanceState | undefined,
  timestamp = new Date().toISOString(),
): AcceptanceState | undefined {
  if (!state?.contract) {
    return undefined;
  }

  return {
    status: state.status === "satisfied" ? "satisfied" : state.status === "idle" ? "idle" : "active",
    contract: normalizeAcceptanceContract(state.contract),
    currentPhase: normalizeText(state.currentPhase) || undefined,
    stalledPhaseCount: clampWholeNumber(state.stalledPhaseCount, 0, 99, 0) ?? 0,
    completedChecks: takeLastUnique(state.completedChecks ?? [], 48),
    pendingChecks: takeLastUnique(state.pendingChecks ?? [], 48),
    lastIssueSummary: normalizeText(state.lastIssueSummary) || undefined,
    updatedAt: normalizeText(state.updatedAt) || timestamp,
  };
}

function findAcceptanceContract(messages: StoredMessage[]): AcceptanceContract | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const userInput = message?.role === "user" ? readUserInput(message.content) : undefined;
    if (!userInput) {
      continue;
    }

    const match = ACCEPTANCE_CONTRACT_PATTERN.exec(userInput);
    if (!match?.[1]) {
      continue;
    }

    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      return normalizeAcceptanceContract(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeAcceptanceContract(contract: Record<string, unknown> | AcceptanceContract): AcceptanceContract {
  const rawRequiredFiles = "requiredFiles" in contract ? contract.requiredFiles : (contract as Record<string, unknown>)["required_files"];
  const rawCommandChecks = "commandChecks" in contract ? contract.commandChecks : (contract as Record<string, unknown>)["command_checks"];
  const rawHttpChecks = "httpChecks" in contract ? contract.httpChecks : (contract as Record<string, unknown>)["http_checks"];
  const requiredFiles = Array.isArray(rawRequiredFiles)
    ? rawRequiredFiles
    : [];
  const commandChecks = Array.isArray(rawCommandChecks)
    ? rawCommandChecks
    : [];
  const httpChecks = Array.isArray(rawHttpChecks)
    ? rawHttpChecks
    : [];

  return {
    kind: normalizeKind(contract.kind),
    summary: normalizeText(contract.summary) || undefined,
    requiredFiles: requiredFiles
      .map((item: unknown) => normalizeFileRequirement(item))
      .filter((item): item is AcceptanceFileRequirement => Boolean(item)),
    commandChecks: commandChecks
      .map((item: unknown) => normalizeCommandRequirement(item))
      .filter((item): item is AcceptanceCommandRequirement => Boolean(item)),
    httpChecks: httpChecks
      .map((item: unknown) => normalizeHttpRequirement(item))
      .filter((item): item is AcceptanceHttpRequirement => Boolean(item)),
  };
}

function normalizeKind(value: unknown): AcceptanceContract["kind"] {
  return value === "research" || value === "document" || value === "product" ? value : "generic";
}

function normalizeFileRequirement(value: unknown): AcceptanceFileRequirement | null {
  if (typeof value === "string") {
    const normalizedPath = normalizeText(value);
    return normalizedPath ? { path: normalizedPath } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const targetPath = normalizeText(record.path);
  if (!targetPath) {
    return null;
  }

  const role = record.role === "source" ? "source" : "deliverable";
  const format = record.format === "json" || record.format === "binary" ? record.format : "text";
  const rawRequiredRecordFields = record.requiredRecordFields ?? record.required_record_fields;
  const requiredRecordFields = Array.isArray(rawRequiredRecordFields)
    ? takeLastUnique(
        rawRequiredRecordFields.map((item: unknown) => normalizeText(item)).filter(Boolean),
        32,
      )
    : [];
  const rawMustContain = record.mustContain ?? record.must_contain;
  const mustContain = Array.isArray(rawMustContain)
    ? takeLastUnique(
        rawMustContain.map((item: unknown) => normalizeText(item)).filter(Boolean),
        32,
      )
    : [];

  return {
    path: targetPath,
    role,
    format,
    minItems: clampWholeNumber(record.minItems ?? record.min_items, 0, 9_999, undefined),
    requiredRecordFields,
    mustContain,
  };
}

function normalizeCommandRequirement(value: unknown): AcceptanceCommandRequirement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeText(record.id);
  const commandContains = normalizeText(record.commandContains ?? record.command_contains);
  if (!id || !commandContains) {
    return null;
  }

  return {
    id,
    commandContains,
  };
}

function normalizeHttpRequirement(value: unknown): AcceptanceHttpRequirement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeText(record.id);
  const url = normalizeText(record.url);
  if (!id || !url) {
    return null;
  }

  const rawBodyContains = record.bodyContains ?? record.body_contains;
  const bodyContains = Array.isArray(rawBodyContains)
    ? takeLastUnique(
        rawBodyContains.map((item: unknown) => normalizeText(item)).filter(Boolean),
        32,
      )
    : [];

  return {
    id,
    url,
    status: clampWholeNumber(record.status, 100, 599, undefined),
    bodyContains,
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeText(values[index]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.unshift(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
