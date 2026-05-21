import { jsonResult } from "../../shared.js";
import {
  assertSpecDocumentName,
  assertSpecStage,
  assertSpecStatus,
  assertSpecTaskStatus,
  SPEC_DOCUMENT_NAMES,
  SPEC_STAGES,
  SPEC_STATUSES,
  SPEC_TASK_STATUSES,
} from "../../../spec/schema.js";
import type {
  SpecDocumentName,
  SpecStage,
  SpecStatus,
  SpecTaskStatus,
} from "../../../spec/types.js";

export { SPEC_DOCUMENT_NAMES, SPEC_STAGES, SPEC_STATUSES, SPEC_TASK_STATUSES };

export function specJsonResult(value: Record<string, unknown>) {
  return jsonResult({ ok: true, ...value });
}

export function readSpecDocumentName(value: unknown): SpecDocumentName {
  if (typeof value !== "string") {
    throw new Error(`Tool argument "document" must be one of: ${SPEC_DOCUMENT_NAMES.join(", ")}.`);
  }
  assertSpecDocumentName(value);
  return value;
}

export function readSpecStage(value: string): SpecStage {
  assertSpecStage(value);
  return value;
}

export function readSpecStatus(value: string): SpecStatus {
  assertSpecStatus(value);
  return value;
}

export function readSpecTaskStatus(value: string): SpecTaskStatus {
  assertSpecTaskStatus(value);
  return value;
}
