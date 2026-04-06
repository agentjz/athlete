import fs from "node:fs/promises";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import type { CoordinationPolicyRecord } from "./types.js";

export class CoordinationPolicyStore {
  constructor(private readonly rootDir: string) {}

  async load(): Promise<CoordinationPolicyRecord> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    try {
      const raw = await fs.readFile(paths.coordinationPolicyFile, "utf8");
      return normalizePolicy(JSON.parse(raw) as CoordinationPolicyRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const initial = createDefaultPolicy();
        await this.save(initial);
        return initial;
      }
      throw error;
    }
  }

  async save(policy: CoordinationPolicyRecord): Promise<CoordinationPolicyRecord> {
    const normalized = normalizePolicy(policy);
    const paths = await ensureProjectStateDirectories(this.rootDir);
    await fs.writeFile(paths.coordinationPolicyFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  async update(updates: Partial<Pick<CoordinationPolicyRecord, "allowPlanDecisions" | "allowShutdownRequests">>): Promise<CoordinationPolicyRecord> {
    const current = await this.load();
    return this.save({
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
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

function createDefaultPolicy(): CoordinationPolicyRecord {
  return {
    allowPlanDecisions: false,
    allowShutdownRequests: false,
    updatedAt: new Date().toISOString(),
  };
}

function normalizePolicy(policy: CoordinationPolicyRecord): CoordinationPolicyRecord {
  return {
    allowPlanDecisions: Boolean(policy.allowPlanDecisions),
    allowShutdownRequests: Boolean(policy.allowShutdownRequests),
    updatedAt: typeof policy.updatedAt === "string" && policy.updatedAt ? policy.updatedAt : new Date().toISOString(),
  };
}
