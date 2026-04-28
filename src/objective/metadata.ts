import crypto from "node:crypto";

import type { TaskRecord } from "../tasks/types.js";
import type {
  ObjectiveExecutionKind,
  ObjectiveFrame,
  ObjectiveTaskMetadata,
  ObjectiveTaskSnapshot,
} from "./types.js";

const OBJECTIVE_METADATA_MARKER = "[deadmouse-objective]";

export function buildObjectiveFrame(text: string): ObjectiveFrame {
  const normalized = normalizeText(text) || "current task";
  return {
    key: crypto.createHash("sha1").update(normalized.toLowerCase()).digest("hex").slice(0, 10),
    text: normalized,
  };
}

export function readObjectiveTask(task: TaskRecord): ObjectiveTaskSnapshot | null {
  const meta = readObjectiveTaskMetadata(task.description);
  if (!meta) {
    return null;
  }

  return {
    record: task,
    meta,
  };
}

export function readObjectiveTaskMetadata(description: string): ObjectiveTaskMetadata | null {
  const escapedMarker = escapeRegExp(OBJECTIVE_METADATA_MARKER);
  const match = String(description ?? "").match(new RegExp(`${escapedMarker}\\s*([\\s\\S]+)$`));
  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<ObjectiveTaskMetadata>;
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
      executor: normalizeExecutionKind(parsed.executor),
      backgroundCommand: normalizeOptionalText(parsed.backgroundCommand),
      delegatedTo: normalizeOptionalText(parsed.delegatedTo),
      jobId: normalizeOptionalText(parsed.jobId),
      executionId: normalizeOptionalText(parsed.executionId),
    };
  } catch {
    return null;
  }
}

export function writeObjectiveTaskMetadata(description: string, meta: ObjectiveTaskMetadata): string {
  const base = stripObjectiveTaskMetadata(description);
  const payload = JSON.stringify(
    {
      key: normalizeText(meta.key),
      kind: meta.kind,
      objective: normalizeText(meta.objective),
      executor: normalizeExecutionKind(meta.executor),
      backgroundCommand: normalizeOptionalText(meta.backgroundCommand),
      delegatedTo: normalizeOptionalText(meta.delegatedTo),
      jobId: normalizeOptionalText(meta.jobId),
      executionId: normalizeOptionalText(meta.executionId),
    },
    null,
    2,
  );

  return [base, OBJECTIVE_METADATA_MARKER, payload]
    .filter((part) => part && part.trim().length > 0)
    .join("\n\n");
}

export function stripObjectiveTaskMetadata(description: string): string {
  const escapedMarker = escapeRegExp(OBJECTIVE_METADATA_MARKER);
  return String(description ?? "")
    .replace(new RegExp(`\\s*${escapedMarker}\\s*[\\s\\S]*$`, "m"), "")
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeExecutionKind(value: unknown): ObjectiveExecutionKind | undefined {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
