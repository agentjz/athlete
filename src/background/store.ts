import { withProjectLedger } from "../control/ledger/open.js";
import { BackgroundJobLedgerRepo } from "../control/ledger/backgroundRepo.js";
import type { BackgroundJobRecord, BackgroundJobStatus } from "./types.js";

export class BackgroundJobStore {
  constructor(private readonly rootDir: string) {}

  async create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    timeoutMs: number;
    stallTimeoutMs?: number;
  }): Promise<BackgroundJobRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).create(input));
  }

  async load(jobId: string): Promise<BackgroundJobRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).load(jobId));
  }

  async save(job: BackgroundJobRecord): Promise<BackgroundJobRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).save(job));
  }

  async setPid(jobId: string, pid: number): Promise<BackgroundJobRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).setPid(jobId, pid));
  }

  async complete(
    jobId: string,
    input: {
      status: BackgroundJobStatus;
      exitCode?: number;
      output?: string;
    },
  ): Promise<BackgroundJobRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).complete(jobId, input));
  }

  async list(): Promise<BackgroundJobRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).list());
  }

  async listRelevant(options: { cwd?: string; requestedBy?: string } = {}): Promise<BackgroundJobRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new BackgroundJobLedgerRepo(db).listRelevant(options));
  }

  async summarize(options: { cwd?: string; requestedBy?: string } = {}): Promise<string> {
    const jobs = await this.listRelevant(options);
    if (jobs.length === 0) {
      return "No background jobs.";
    }

    return jobs
      .slice(0, 12)
      .map((job) => {
        const marker = job.status === "completed"
          ? "[x]"
          : job.status === "failed"
            ? "[!]"
            : job.status === "timed_out"
              ? "[t]"
              : "[>]";
        const exit = typeof job.exitCode === "number" ? ` exit=${job.exitCode}` : "";
        return `${marker} ${job.id} @${job.requestedBy} ${job.command}${exit}`;
      })
      .join("\n");
  }
}
