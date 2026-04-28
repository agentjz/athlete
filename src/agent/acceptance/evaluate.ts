import fs from "node:fs/promises";
import path from "node:path";

import { deriveAcceptanceState, normalizeAcceptanceState } from "./contract.js";
import { collectAcceptanceSignals } from "./signals.js";
import { detectTextCorruption, normalizeTextForStorage } from "../../utils/text.js";
import type {
  AcceptanceContract,
  AcceptanceFileRequirement,
  AcceptanceState,
  SessionRecord,
  StoredMessage,
} from "../../types.js";

export interface AcceptanceEvaluationResult {
  session: SessionRecord;
  state: AcceptanceState;
  satisfied: boolean;
  summary: string;
}

export async function evaluateAcceptanceState(input: {
  session: SessionRecord;
  cwd: string;
}): Promise<AcceptanceEvaluationResult> {
  const previous = normalizeAcceptanceState(input.session.acceptanceState) ?? deriveAcceptanceState(input.session.messages);
  if (!previous?.contract) {
    return {
      session: input.session,
      state: {
        status: "idle",
        stalledPhaseCount: 0,
        completedChecks: [],
        pendingChecks: [],
        updatedAt: new Date().toISOString(),
      },
      satisfied: true,
      summary: "No acceptance contract.",
    };
  }

  const fileChecks = await evaluateFileChecks(previous.contract, input.cwd);
  const commandChecks = evaluateCommandChecks(previous.contract, input.session.messages);
  const signals = collectAcceptanceSignals(input.session.messages);
  const httpChecks = evaluateHttpChecks(previous.contract, signals);
  const completedChecks = [...fileChecks.completedChecks, ...commandChecks.completedChecks, ...httpChecks.completedChecks];
  const pendingChecks = [...fileChecks.pendingChecks, ...commandChecks.pendingChecks, ...httpChecks.pendingChecks];
  const phase = determineAcceptancePhase({
    contract: previous.contract,
    hasSuccessfulDocumentRead: signals.some((signal) => signal.kind === "document_read_completed"),
    fileChecks,
    pendingChecks,
  });
  const stalledPhaseCount =
    previous.currentPhase === phase && completedChecks.length === previous.completedChecks.length && pendingChecks.length > 0
      ? previous.stalledPhaseCount + 1
      : 0;

  const state: AcceptanceState = {
    status: pendingChecks.length === 0 ? "satisfied" : "active",
    contract: previous.contract,
    currentPhase: phase,
    stalledPhaseCount,
    completedChecks,
    pendingChecks,
    lastIssueSummary: buildAcceptanceSummary(previous.contract, phase, pendingChecks, stalledPhaseCount),
    updatedAt: new Date().toISOString(),
  };

  return {
    session: {
      ...input.session,
      acceptanceState: state,
    },
    state,
    satisfied: pendingChecks.length === 0,
    summary: state.lastIssueSummary ?? "Acceptance checks satisfied.",
  };
}

function determineAcceptancePhase(input: {
  contract: AcceptanceContract;
  hasSuccessfulDocumentRead: boolean;
  fileChecks: Awaited<ReturnType<typeof evaluateFileChecks>>;
  pendingChecks: string[];
}): string {
  if (input.pendingChecks.length === 0) {
    return "complete";
  }

  if (input.contract.kind === "document") {
    if (input.fileChecks.missingSourceFiles.length > 0) {
      return "acquire_document";
    }
    if (!input.hasSuccessfulDocumentRead) {
      return "read_document";
    }
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "assemble_outputs";
    }
    return "bind_evidence";
  }

  if (input.contract.kind === "research") {
    if (input.pendingChecks.some((check) => check.includes("json_fields"))) {
      return "bind_evidence";
    }
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "assemble_outputs";
    }
    return "verify_outputs";
  }

  if (input.contract.kind === "product") {
    if (input.fileChecks.missingDeliverables.length > 0) {
      return "build_product";
    }
    return "verify_outputs";
  }

  return input.fileChecks.missingDeliverables.length > 0 ? "assemble_outputs" : "verify_outputs";
}

async function evaluateFileChecks(contract: AcceptanceContract, cwd: string): Promise<{
  completedChecks: string[];
  pendingChecks: string[];
  missingSourceFiles: string[];
  missingDeliverables: string[];
}> {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];
  const missingSourceFiles: string[] = [];
  const missingDeliverables: string[] = [];

  for (const requirement of contract.requiredFiles) {
    const checkId = `file:${requirement.path}`;
    const resolvedPath = path.resolve(cwd, requirement.path);
    const stat = await fs.stat(resolvedPath).catch(() => null);
    if (!stat?.isFile()) {
      pendingChecks.push(checkId);
      if (requirement.role === "source") {
        missingSourceFiles.push(requirement.path);
      } else {
        missingDeliverables.push(requirement.path);
      }
      continue;
    }

    completedChecks.push(checkId);
    if (requirement.format === "binary") {
      continue;
    }

    const raw = await fs.readFile(resolvedPath, "utf8");
    const normalized = normalizeTextForStorage(raw);
    if (detectTextCorruption(normalized)) {
      pendingChecks.push(`text_integrity:${requirement.path}`);
      continue;
    }

    if (requirement.format === "json") {
      const jsonResult = evaluateJsonRequirement(requirement, normalized);
      completedChecks.push(...jsonResult.completedChecks.map((suffix) => `${suffix}:${requirement.path}`));
      pendingChecks.push(...jsonResult.pendingChecks.map((suffix) => `${suffix}:${requirement.path}`));
      continue;
    }

    for (const needle of requirement.mustContain ?? []) {
      const normalizedNeedle = String(needle ?? "").trim();
      if (!normalizedNeedle) {
        continue;
      }
      if (normalized.includes(normalizedNeedle)) {
        completedChecks.push(`text_contains:${requirement.path}:${normalizedNeedle}`);
      } else {
        pendingChecks.push(`text_contains:${requirement.path}:${normalizedNeedle}`);
      }
    }
  }

  return {
    completedChecks: takeLastUnique(completedChecks, 96),
    pendingChecks: takeLastUnique(pendingChecks, 96),
    missingSourceFiles: takeLastUnique(missingSourceFiles, 24),
    missingDeliverables: takeLastUnique(missingDeliverables, 24),
  };
}

function evaluateJsonRequirement(requirement: AcceptanceFileRequirement, raw: string): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = ["json_parse"];
  const pendingChecks: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      completedChecks: [],
      pendingChecks: ["json_parse"],
    };
  }

  if (typeof requirement.minItems === "number") {
    const itemCount = Array.isArray(parsed) ? parsed.length : 0;
    if (itemCount >= requirement.minItems) {
      completedChecks.push("json_min_items");
    } else {
      pendingChecks.push("json_min_items");
    }
  }

  if ((requirement.requiredRecordFields?.length ?? 0) > 0) {
    if (!Array.isArray(parsed) || parsed.length === 0) {
      pendingChecks.push("json_fields");
    } else {
      const missingFields = collectMissingFields(parsed, requirement.requiredRecordFields ?? []);
      if (missingFields.length > 0) {
        pendingChecks.push(`json_fields(${missingFields.join(",")})`);
      } else {
        completedChecks.push("json_fields");
      }
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function hasRequiredFields(entry: unknown, requiredFields: string[]): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }

  const record = entry as Record<string, unknown>;
  return requiredFields.every((field) => {
    const value = record[field];
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return value !== null && value !== undefined;
  });
}

function collectMissingFields(entries: unknown[], requiredFields: string[]): string[] {
  const missing = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      requiredFields.forEach((field) => missing.add(field));
      continue;
    }

    const record = entry as Record<string, unknown>;
    for (const field of requiredFields) {
      const value = record[field];
      if (typeof value === "string" ? value.trim().length === 0 : value === null || value === undefined) {
        missing.add(field);
      }
    }
  }

  return [...missing];
}

function evaluateCommandChecks(contract: AcceptanceContract, messages: StoredMessage[]): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];

  for (const check of contract.commandChecks) {
    if (hasSuccessfulCommand(messages, check.commandContains)) {
      completedChecks.push(`command:${check.id}`);
    } else {
      pendingChecks.push(`command:${check.id}`);
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function evaluateHttpChecks(
  contract: AcceptanceContract,
  signals: ReturnType<typeof collectAcceptanceSignals>,
): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];

  for (const check of contract.httpChecks) {
    if (hasVerifiedEndpoint(signals, check.url, check.status, check.bodyContains ?? [])) {
      completedChecks.push(`http:${check.id}`);
    } else {
      pendingChecks.push(`http:${check.id}`);
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function hasSuccessfulCommand(messages: StoredMessage[], commandContains: string): boolean {
  const needle = commandContains.toLowerCase();
  return messages.some((message) => {
    if (message.role !== "tool" || !message.content || (message.name !== "run_shell" && message.name !== "background_check")) {
      return false;
    }

    const payload = tryParseRecord(message.content);
    if (!payload) {
      return false;
    }

    if (message.name === "background_check" && payload.job && typeof payload.job === "object") {
      const job = payload.job as Record<string, unknown>;
      const command = String(job.command ?? "").toLowerCase();
      const status = String(job.status ?? "").toLowerCase();
      const exitCode = typeof job.exitCode === "number" ? job.exitCode : null;
      return command.includes(needle) && status === "completed" && exitCode === 0;
    }

    const command = String(payload.command ?? "").toLowerCase();
    const status = String(payload.status ?? "").toLowerCase();
    const exitCode = typeof payload.exitCode === "number" ? payload.exitCode : null;
    return command.includes(needle) && status === "completed" && exitCode === 0;
  });
}

function tryParseRecord(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasVerifiedEndpoint(
  signals: ReturnType<typeof collectAcceptanceSignals>,
  url: string,
  status: number | undefined,
  bodyContains: string[],
): boolean {
  return signals.some((signal) => {
    if (signal.kind === "http_endpoint_verified") {
      if (signal.url !== url) {
        return false;
      }
      if (typeof status === "number" && signal.status !== status) {
        return false;
      }

      return bodyContains.every((needle) => String(signal.body ?? "").includes(needle));
    }

    if (signal.kind === "web_page_verified") {
      if (signal.url !== url) {
        return false;
      }

      return bodyContains.every((needle) => String(signal.pageText ?? "").includes(needle));
    }

    return false;
  });
}

function buildAcceptanceSummary(
  contract: AcceptanceContract,
  phase: string,
  pendingChecks: string[],
  stalledPhaseCount: number,
): string {
  const parts = [
    `Acceptance contract (${contract.kind}) is in phase '${phase}'.`,
  ];

  if (pendingChecks.length > 0) {
    parts.push(`Pending checks: ${pendingChecks.slice(0, 8).join(", ")}.`);
  }

  if (stalledPhaseCount > 0) {
    parts.push(`This phase has stalled for ${stalledPhaseCount} consecutive evaluation(s).`);
  }

  return parts.join(" ");
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const normalized = String(values[index] ?? "").trim();
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
