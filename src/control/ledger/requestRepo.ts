import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { PROTOCOL_REQUEST_KINDS } from "../../team/types.js";
import type {
  ProtocolDecisionRecord,
  ProtocolRequestKind,
  ProtocolRequestRecord,
  ProtocolRequestStatus,
} from "../../team/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export class ProtocolRequestLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    kind: ProtocolRequestKind;
    from: string;
    to: string;
    subject: string;
    content: string;
  }): ProtocolRequestRecord {
    const timestamp = currentTimestamp();
    const record = normalizeProtocolRequest({
      id: createRequestId(),
      kind: input.kind,
      from: input.from,
      to: input.to,
      subject: input.subject,
      content: input.content,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    this.db.prepare(`
      INSERT INTO protocol_requests (
        id,
        kind,
        from_name,
        to_name,
        subject,
        content,
        status,
        decision_approve,
        decision_feedback,
        decision_responded_by,
        decision_responded_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.kind,
      record.from,
      record.to,
      record.subject,
      record.content,
      record.status,
      null,
      null,
      null,
      null,
      record.createdAt,
      record.updatedAt,
    );
    return this.loadOrThrow(record.id);
  }

  load(requestId: string): ProtocolRequestRecord | null {
    const row = this.db.prepare(`
      SELECT
        id,
        kind,
        from_name,
        to_name,
        subject,
        content,
        status,
        decision_approve,
        decision_feedback,
        decision_responded_by,
        decision_responded_at,
        created_at,
        updated_at
      FROM protocol_requests
      WHERE id = ?
    `).get(normalizeId(requestId)) as ProtocolRequestRow | undefined;

    return row ? mapProtocolRequestRow(row) : null;
  }

  loadOrThrow(requestId: string): ProtocolRequestRecord {
    const request = this.load(requestId);
    if (!request) {
      throw new Error(`Unknown protocol request: ${requestId}`);
    }

    return request;
  }

  resolve(
    requestId: string,
    input: {
      approve: boolean;
      feedback?: string;
      respondedBy: string;
    },
  ): ProtocolRequestRecord {
    const current = this.loadOrThrow(requestId);
    if (current.status !== "pending") {
      throw new Error(`Protocol request ${requestId} is already ${current.status}.`);
    }

    const timestamp = currentTimestamp();
    this.db.prepare(`
      UPDATE protocol_requests
      SET
        status = ?,
        decision_approve = ?,
        decision_feedback = ?,
        decision_responded_by = ?,
        decision_responded_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.approve ? "approved" : "rejected",
      input.approve ? 1 : 0,
      normalizeText(input.feedback),
      normalizeName(input.respondedBy) || "lead",
      timestamp,
      timestamp,
      current.id,
    );
    return this.loadOrThrow(current.id);
  }

  list(): ProtocolRequestRecord[] {
    const rows = this.db.prepare(`
      SELECT
        id,
        kind,
        from_name,
        to_name,
        subject,
        content,
        status,
        decision_approve,
        decision_feedback,
        decision_responded_by,
        decision_responded_at,
        created_at,
        updated_at
      FROM protocol_requests
      ORDER BY updated_at DESC
    `).all() as ProtocolRequestRow[];
    return rows.map((row) => mapProtocolRequestRow(row));
  }
}

interface ProtocolRequestRow {
  id: string;
  kind: string;
  from_name: string;
  to_name: string;
  subject: string;
  content: string;
  status: string;
  decision_approve: number | null;
  decision_feedback: string | null;
  decision_responded_by: string | null;
  decision_responded_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapProtocolRequestRow(row: ProtocolRequestRow): ProtocolRequestRecord {
  const decision = row.decision_approve === null
    ? undefined
    : normalizeDecision({
      approve: Boolean(row.decision_approve),
      feedback: row.decision_feedback ?? undefined,
      respondedBy: row.decision_responded_by ?? undefined,
      respondedAt: row.decision_responded_at ?? undefined,
    });

  return normalizeProtocolRequest({
    id: row.id,
    kind: row.kind as ProtocolRequestKind,
    from: row.from_name,
    to: row.to_name,
    subject: row.subject,
    content: row.content,
    status: row.status as ProtocolRequestStatus,
    decision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalizeProtocolRequest(record: ProtocolRequestRecord): ProtocolRequestRecord {
  const now = currentTimestamp();
  return {
    id: normalizeId(record.id) || createRequestId(),
    kind: normalizeKind(record.kind),
    from: normalizeName(record.from) || "lead",
    to: normalizeName(record.to) || "lead",
    subject: normalizeText(record.subject) || "Request",
    content: normalizeText(record.content),
    status: normalizeStatus(record.status),
    decision: normalizeDecision(record.decision),
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
  };
}

function normalizeKind(value: unknown): ProtocolRequestKind {
  const normalized = normalizeText(value);
  const kind = PROTOCOL_REQUEST_KINDS.find((entry) => entry === normalized);
  if (!kind) {
    throw new Error(`Invalid protocol request kind: ${String(value ?? "")}`);
  }
  return kind;
}

function normalizeStatus(value: unknown): ProtocolRequestStatus {
  const normalized = normalizeText(value);
  return normalized === "pending" || normalized === "approved" || normalized === "rejected"
    ? normalized
    : "pending";
}

function normalizeDecision(value: unknown): ProtocolDecisionRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Partial<ProtocolDecisionRecord>;
  if (typeof record.approve !== "boolean") {
    return undefined;
  }

  return {
    approve: record.approve,
    feedback: normalizeText(record.feedback),
    respondedBy: normalizeName(record.respondedBy) || "lead",
    respondedAt: typeof record.respondedAt === "string" && record.respondedAt ? record.respondedAt : currentTimestamp(),
  };
}

function createRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "-");
}
