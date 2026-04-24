import type Database from "better-sqlite3";

import type { TeamConfigRecord, TeamMemberRecord, TeamMemberStatus } from "../../team/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export class TeamLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  loadConfig(): TeamConfigRecord {
    const row = this.db.prepare(`
      SELECT team_name, updated_at
      FROM team_config
      WHERE id = 1
    `).get() as { team_name: string; updated_at: string } | undefined;
    return {
      teamName: normalizeText(row?.team_name) || "default",
      members: this.listMembers(),
    };
  }

  saveConfig(config: TeamConfigRecord): TeamConfigRecord {
    const normalized = normalizeConfig(config);
    const now = currentTimestamp();
    const transaction = this.db.transaction((record: TeamConfigRecord) => {
      this.db.prepare(`
        INSERT INTO team_config (id, team_name, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          team_name = excluded.team_name,
          updated_at = excluded.updated_at
      `).run(record.teamName, now);
      this.db.prepare(`DELETE FROM team_members`).run();
      for (const member of record.members) {
        insertOrReplaceTeamMember(this.db, member);
      }
      return this.loadConfig();
    });

    return transaction(normalized);
  }

  listMembers(): TeamMemberRecord[] {
    const rows = this.db.prepare(`
      SELECT name, role, status, session_id, pid, created_at, updated_at
      FROM team_members
      ORDER BY name
    `).all() as Array<{
      name: string;
      role: string;
      status: string;
      session_id: string | null;
      pid: number | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => normalizeMember({
      name: row.name,
      role: row.role,
      status: row.status as TeamMemberStatus,
      sessionId: row.session_id ?? undefined,
      pid: row.pid ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findMember(name: string): TeamMemberRecord | undefined {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      return undefined;
    }

    return this.listMembers().find((member) => member.name === normalizedName);
  }

  upsertMember(
    name: string,
    role: string,
    status: TeamMemberStatus,
    options: {
      sessionId?: string;
      pid?: number;
    } = {},
  ): TeamMemberRecord {
    const normalizedName = normalizeName(name);
    const now = currentTimestamp();
    const existing = this.findMember(normalizedName);
    const nextMember = normalizeMember({
      name: normalizedName,
      role,
      status,
      sessionId: options.sessionId ?? existing?.sessionId,
      pid: typeof options.pid === "number" ? options.pid : existing?.pid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    insertOrReplaceTeamMember(this.db, nextMember);
    return this.findMember(normalizedName) ?? nextMember;
  }

  updateMemberStatus(name: string, status: TeamMemberStatus, pid?: number): TeamMemberRecord {
    const member = this.findMember(name);
    if (!member) {
      throw new Error(`Unknown teammate: ${name}`);
    }

    if (member.status === "shutdown" && status !== "shutdown") {
      return member;
    }

    return this.upsertMember(member.name, member.role, status, {
      sessionId: member.sessionId,
      pid: typeof pid === "number" ? pid : member.pid,
    });
  }

  setMemberSession(name: string, sessionId: string): TeamMemberRecord {
    const member = this.findMember(name);
    if (!member) {
      throw new Error(`Unknown teammate: ${name}`);
    }

    return this.upsertMember(member.name, member.role, member.status, {
      sessionId,
      pid: member.pid,
    });
  }
}

function insertOrReplaceTeamMember(db: Database.Database, member: TeamMemberRecord): void {
  db.prepare(`
    INSERT INTO team_members (name, role, status, session_id, pid, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      session_id = excluded.session_id,
      pid = excluded.pid,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    member.name,
    member.role,
    member.status,
    member.sessionId ?? null,
    member.pid ?? null,
    member.createdAt,
    member.updatedAt,
  );
}

function normalizeConfig(config: TeamConfigRecord): TeamConfigRecord {
  return {
    teamName: normalizeText(config.teamName) || "default",
    members: Array.isArray(config.members)
      ? config.members.map((member) => normalizeMember(member)).sort((left, right) => left.name.localeCompare(right.name))
      : [],
  };
}

function normalizeMember(member: TeamMemberRecord): TeamMemberRecord {
  const now = currentTimestamp();
  return {
    name: normalizeName(member.name),
    role: normalizeText(member.role) || "generalist",
    status: normalizeMemberStatus(member.status),
    sessionId: typeof member.sessionId === "string" && member.sessionId ? member.sessionId : undefined,
    pid: typeof member.pid === "number" && Number.isFinite(member.pid) ? Math.trunc(member.pid) : undefined,
    createdAt: typeof member.createdAt === "string" && member.createdAt ? member.createdAt : now,
    updatedAt: typeof member.updatedAt === "string" && member.updatedAt ? member.updatedAt : now,
  };
}

function normalizeMemberStatus(value: string): TeamMemberStatus {
  return value === "working" || value === "idle" || value === "shutdown" ? value : "idle";
}

function normalizeName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "-");
}
