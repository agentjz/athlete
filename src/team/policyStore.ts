import { withProjectLedger } from "../control/ledger/open.js";
import { CoordinationPolicyLedgerRepo } from "../control/ledger/policyRepo.js";
import type { CoordinationPolicyRecord } from "./types.js";

export class CoordinationPolicyStore {
  constructor(private readonly rootDir: string) {}

  async load(): Promise<CoordinationPolicyRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new CoordinationPolicyLedgerRepo(db).load());
  }

  async save(policy: CoordinationPolicyRecord): Promise<CoordinationPolicyRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new CoordinationPolicyLedgerRepo(db).save(policy));
  }

  async update(
    updates: Partial<Pick<CoordinationPolicyRecord, "allowPlanDecisions" | "allowShutdownRequests">>,
  ): Promise<CoordinationPolicyRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new CoordinationPolicyLedgerRepo(db).update(updates));
  }

  async summarize(): Promise<string> {
    const policy = await this.load();
    return [
      `- plan decisions: ${policy.allowPlanDecisions ? "allowed" : "locked"}`,
      `- shutdown requests: ${policy.allowShutdownRequests ? "allowed" : "locked"}`,
      `- updated at: ${policy.updatedAt}`,
    ].join("\n");
  }
}
