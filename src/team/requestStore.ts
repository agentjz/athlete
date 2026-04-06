import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import { PROTOCOL_REQUEST_KINDS } from "./types.js";
import type {
  ProtocolDecisionRecord,
  ProtocolRequestKind,
  ProtocolRequestRecord,
  ProtocolRequestStatus,
} from "./types.js";

export class ProtocolRequestStore {
  constructor(private readonly rootDir: string) {}

  async create(input: {
    kind: ProtocolRequestKind;
    from: string;
    to: string;
    subject: string;
    content: string;
  }): Promise<ProtocolRequestRecord> {
    const timestamp = new Date().toISOString();
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
    await this.save(record);
    return record;
  }

  async load(requestId: string): Promise<ProtocolRequestRecord | null> {
    const filePath = this.getRequestPath(requestId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return normalizeProtocolRequest(JSON.parse(raw) as ProtocolRequestRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async loadOrThrow(requestId: string): Promise<ProtocolRequestRecord> {
    const request = await this.load(requestId);
    if (!request) {
      throw new Error(`Unknown protocol request: ${requestId}`);
    }

    return request;
  }

  async resolve(
    requestId: string,
    input: {
      approve: boolean;
      feedback?: string;
      respondedBy: string;
    },
  ): Promise<ProtocolRequestRecord> {
    const current = await this.loadOrThrow(requestId);
    if (current.status !== "pending") {
      throw new Error(`Protocol request ${requestId} is already ${current.status}.`);
    }

    const timestamp = new Date().toISOString();
    const next = normalizeProtocolRequest({
      ...current,
      status: input.approve ? "approved" : "rejected",
      decision: {
        approve: input.approve,
        feedback: input.feedback,
        respondedBy: input.respondedBy,
        respondedAt: timestamp,
      },
      updatedAt: timestamp,
    });
    await this.save(next);
    return next;
  }

  async list(): Promise<ProtocolRequestRecord[]> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const entries = await fs.readdir(paths.requestsDir, { withFileTypes: true });
    const requests = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^request_[a-z0-9_-]+\.json$/i.test(entry.name))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(paths.requestsDir, entry.name), "utf8");
          return normalizeProtocolRequest(JSON.parse(raw) as ProtocolRequestRecord);
        }),
    );

    return requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async summarize(limit = 12): Promise<string> {
    const requests = await this.list();
    if (requests.length === 0) {
      return "No protocol requests.";
    }

    return requests
      .slice(0, Math.max(1, Math.trunc(limit)))
      .map((request) => {
        const status = formatStatus(request.status);
        const route = `${request.from} -> ${request.to}`;
        return `${status} ${request.kind} ${request.id} ${route} ${truncate(request.subject, 80)}`;
      })
      .join("\n");
  }

  private async save(request: ProtocolRequestRecord): Promise<void> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    await fs.writeFile(this.getRequestPath(request.id, paths.requestsDir), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  }

  private getRequestPath(requestId: string, baseDir = getProjectStatePaths(this.rootDir).requestsDir): string {
    return path.join(baseDir, `request_${normalizeId(requestId)}.json`);
  }
}

function normalizeProtocolRequest(record: ProtocolRequestRecord): ProtocolRequestRecord {
  const now = new Date().toISOString();
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
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected") {
    return normalized;
  }

  return "pending";
}

function normalizeDecision(value: unknown): ProtocolDecisionRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Partial<ProtocolDecisionRecord>;
  if (typeof record.approve !== "boolean") {
    return undefined;
  }

  const respondedAt = typeof record.respondedAt === "string" && record.respondedAt ? record.respondedAt : new Date().toISOString();
  return {
    approve: record.approve,
    feedback: normalizeText(record.feedback),
    respondedBy: normalizeName(record.respondedBy) || "lead",
    respondedAt,
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

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatStatus(status: ProtocolRequestStatus): string {
  switch (status) {
    case "approved":
      return "[x]";
    case "rejected":
      return "[!]";
    default:
      return "[>]";
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}
