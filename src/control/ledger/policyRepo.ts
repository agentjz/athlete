import type Database from "better-sqlite3";

import type { CoordinationPolicyRecord } from "../../capabilities/team/types.js";
import { currentTimestamp } from "./shared.js";

export class CoordinationPolicyLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  load(): CoordinationPolicyRecord {
    const row = this.db.prepare(`
      SELECT allow_plan_decisions, allow_shutdown_requests, updated_at
      FROM coordination_policy
      WHERE id = 1
    `).get() as {
      allow_plan_decisions: number;
      allow_shutdown_requests: number;
      updated_at: string;
    } | undefined;

    return normalizePolicy({
      allowPlanDecisions: Boolean(row?.allow_plan_decisions),
      allowShutdownRequests: Boolean(row?.allow_shutdown_requests),
      updatedAt: row?.updated_at,
    });
  }

  save(policy: CoordinationPolicyRecord): CoordinationPolicyRecord {
    const normalized = normalizePolicy(policy);
    this.db.prepare(`
      INSERT INTO coordination_policy (id, allow_plan_decisions, allow_shutdown_requests, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        allow_plan_decisions = excluded.allow_plan_decisions,
        allow_shutdown_requests = excluded.allow_shutdown_requests,
        updated_at = excluded.updated_at
    `).run(
      normalized.allowPlanDecisions ? 1 : 0,
      normalized.allowShutdownRequests ? 1 : 0,
      normalized.updatedAt,
    );
    return this.load();
  }

  update(
    updates: Partial<Pick<CoordinationPolicyRecord, "allowPlanDecisions" | "allowShutdownRequests">>,
  ): CoordinationPolicyRecord {
    const current = this.load();
    return this.save({
      ...current,
      ...updates,
      updatedAt: currentTimestamp(),
    });
  }
}

function normalizePolicy(policy: Partial<CoordinationPolicyRecord>): CoordinationPolicyRecord {
  return {
    allowPlanDecisions: Boolean(policy.allowPlanDecisions),
    allowShutdownRequests: Boolean(policy.allowShutdownRequests),
    updatedAt: typeof policy.updatedAt === "string" && policy.updatedAt ? policy.updatedAt : currentTimestamp(),
  };
}
