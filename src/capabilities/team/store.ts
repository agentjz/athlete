import { withProjectLedger } from "../../control/ledger/open.js";
import { TeamLedgerRepo } from "../../control/ledger/teamRepo.js";
import type {
  TeamConfigRecord,
  TeamMemberRecord,
  TeamMemberStatus,
} from "./types.js";

export class TeamStore {
  constructor(private readonly rootDir: string) {}

  async loadConfig(): Promise<TeamConfigRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).loadConfig());
  }

  async saveConfig(config: TeamConfigRecord): Promise<TeamConfigRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).saveConfig(config));
  }

  async listMembers(): Promise<TeamMemberRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).listMembers());
  }

  async findMember(name: string): Promise<TeamMemberRecord | undefined> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).findMember(name));
  }

  async upsertMember(
    name: string,
    role: string,
    status: TeamMemberStatus,
    options: {
      sessionId?: string;
      pid?: number;
    } = {},
  ): Promise<TeamMemberRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).upsertMember(name, role, status, options));
  }

  async updateMemberStatus(name: string, status: TeamMemberStatus, pid?: number): Promise<TeamMemberRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).updateMemberStatus(name, status, pid));
  }

  async setMemberSession(name: string, sessionId: string): Promise<TeamMemberRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TeamLedgerRepo(db).setMemberSession(name, sessionId));
  }

  async summarizeMembers(): Promise<string> {
    const config = await this.loadConfig();
    if (config.members.length === 0) {
      return "No teammates.";
    }

    return [
      `Team: ${config.teamName}`,
      ...config.members.map((member) => `  ${member.name} (${member.role}): ${member.status}`),
    ].join("\n");
  }
}
