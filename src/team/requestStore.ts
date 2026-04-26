import { withProjectLedger } from "../control/ledger/open.js";
import { ProtocolRequestLedgerRepo } from "../control/ledger/requestRepo.js";
import type {
  ProtocolRequestKind,
  ProtocolRequestRecord,
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
    return withProjectLedger(this.rootDir, ({ db }) => new ProtocolRequestLedgerRepo(db).create(input));
  }

  async load(requestId: string): Promise<ProtocolRequestRecord | null> {
    return withProjectLedger(this.rootDir, ({ db }) => new ProtocolRequestLedgerRepo(db).load(requestId));
  }

  async loadOrThrow(requestId: string): Promise<ProtocolRequestRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ProtocolRequestLedgerRepo(db).loadOrThrow(requestId));
  }

  async resolve(
    requestId: string,
    input: {
      approve: boolean;
      feedback?: string;
      respondedBy: string;
    },
  ): Promise<ProtocolRequestRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ProtocolRequestLedgerRepo(db).resolve(requestId, input));
  }

  async list(): Promise<ProtocolRequestRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new ProtocolRequestLedgerRepo(db).list());
  }

  async summarize(limit = 12): Promise<string> {
    const requests = await this.list();
    if (requests.length === 0) {
      return "No protocol requests.";
    }

    return requests
      .slice(0, Math.max(1, Math.trunc(limit)))
      .map((request) => {
        const status = request.status === "approved" ? "[x]" : request.status === "rejected" ? "[!]" : "[>]";
        const route = `${request.from} -> ${request.to}`;
        const subject = request.subject.length <= 80 ? request.subject : `${request.subject.slice(0, 80)}...`;
        return `${status} ${request.kind} ${request.id} ${route} ${subject}`;
      })
      .join("\n");
  }

  async summarizeForCurrentPrompt(): Promise<string> {
    const requests = await this.list();
    const pendingCount = requests.filter((request) => request.status === "pending").length;
    if (pendingCount === 0) {
      return "No protocol requests.";
    }

    return `Protocol requests hidden from current prompt: ${pendingCount}. Machine gates still track unresolved protocol state.`;
  }
}
