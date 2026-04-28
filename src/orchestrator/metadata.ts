import crypto from "node:crypto";

import type { TaskRecord } from "../tasks/types.js";
import type {
  OrchestratorExecutorKind,
  OrchestratorObjective,
  OrchestratorTaskMeta,
  OrchestratorTaskSnapshot,
} from "./types.js";

const ORCHESTRATOR_MARKER = "[deadmouse-orchestrator]";

export function buildOrchestratorObjective(text: string): OrchestratorObjective {
  const normalized = normalizeText(text) || "current task";
  return {
    key: crypto.createHash("sha1").update(normalized.toLowerCase()).digest("hex").slice(0, 10),
    text: normalized,
  };
}

export function readOrchestratorTask(task: TaskRecord): OrchestratorTaskSnapshot | null {
  const meta = readOrchestratorMetadata(task.description);
  if (!meta) {
    return null;
  }

  return {
    record: task,
    meta,
  };
}

export function readOrchestratorMetadata(description: string): OrchestratorTaskMeta | null {
  const match = String(description ?? "").match(/\[deadmouse-orchestrator\]\s*([\s\S]+)$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<OrchestratorTaskMeta>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.key || !parsed.kind || !parsed.objective) {
      return null;
    }

    if (
      parsed.kind !== "survey" &&
      parsed.kind !== "implementation" &&
      parsed.kind !== "validation" &&
      parsed.kind !== "merge"
    ) {
      return null;
    }

    return {
      key: normalizeText(parsed.key),
      kind: parsed.kind,
      objective: normalizeText(parsed.objective),
      executor: normalizeExecutor(parsed.executor),
      backgroundCommand: normalizeOptionalText(parsed.backgroundCommand),
      delegatedTo: normalizeOptionalText(parsed.delegatedTo),
      jobId: normalizeOptionalText(parsed.jobId),
      executionId: normalizeOptionalText(parsed.executionId),
    };
  } catch {
    return null;
  }
}

export function writeOrchestratorMetadata(description: string, meta: OrchestratorTaskMeta): string {
  const base = stripOrchestratorMetadata(description);
  const payload = JSON.stringify(
    {
      key: normalizeText(meta.key),
      kind: meta.kind,
      objective: normalizeText(meta.objective),
      executor: normalizeExecutor(meta.executor),
      backgroundCommand: normalizeOptionalText(meta.backgroundCommand),
      delegatedTo: normalizeOptionalText(meta.delegatedTo),
      jobId: normalizeOptionalText(meta.jobId),
      executionId: normalizeOptionalText(meta.executionId),
    },
    null,
    2,
  );

  return [base, ORCHESTRATOR_MARKER, payload]
    .filter((part) => part && part.trim().length > 0)
    .join("\n\n");
}

export function stripOrchestratorMetadata(description: string): string {
  return String(description ?? "")
    .replace(/\s*\[deadmouse-orchestrator\]\s*[\s\S]*$/m, "")
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeExecutor(value: unknown): OrchestratorExecutorKind | undefined {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "lead" ||
    normalized === "subagent" ||
    normalized === "teammate" ||
    normalized === "background"
  ) {
    return normalized;
  }

  return undefined;
}
