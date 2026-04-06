import fs from "node:fs/promises";

import { ensureProjectStateDirectories } from "../project/statePaths.js";
import type {
  TeamConfigRecord,
  TeamMemberRecord,
  TeamMemberStatus,
} from "./types.js";

export class TeamStore {
  constructor(private readonly rootDir: string) {}

  async loadConfig(): Promise<TeamConfigRecord> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    try {
      const raw = await fs.readFile(paths.teamConfigFile, "utf8");
      return normalizeConfig(JSON.parse(raw) as TeamConfigRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const initial = normalizeConfig({
          teamName: "default",
          members: [],
        });
        await this.saveConfig(initial);
        return initial;
      }
      throw error;
    }
  }

  async saveConfig(config: TeamConfigRecord): Promise<TeamConfigRecord> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const normalized = normalizeConfig(config);
    await fs.writeFile(paths.teamConfigFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  async listMembers(): Promise<TeamMemberRecord[]> {
    return (await this.loadConfig()).members;
  }

  async findMember(name: string): Promise<TeamMemberRecord | undefined> {
    const normalizedName = normalizeName(name);
    return (await this.loadConfig()).members.find((member) => member.name === normalizedName);
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
    const config = await this.loadConfig();
    const normalizedName = normalizeName(name);
    const now = new Date().toISOString();
    const existing = config.members.find((member) => member.name === normalizedName);
    const nextMember = normalizeMember({
      name: normalizedName,
      role,
      status,
      sessionId: options.sessionId ?? existing?.sessionId,
      pid: typeof options.pid === "number" ? options.pid : existing?.pid,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    const nextMembers = existing
      ? config.members.map((member) => (member.name === normalizedName ? nextMember : member))
      : [...config.members, nextMember];

    await this.saveConfig({
      ...config,
      members: nextMembers,
    });
    return nextMember;
  }

  async updateMemberStatus(name: string, status: TeamMemberStatus, pid?: number): Promise<TeamMemberRecord> {
    const member = await this.findMember(name);
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

  async setMemberSession(name: string, sessionId: string): Promise<TeamMemberRecord> {
    const member = await this.findMember(name);
    if (!member) {
      throw new Error(`Unknown teammate: ${name}`);
    }

    return this.upsertMember(member.name, member.role, member.status, {
      sessionId,
      pid: member.pid,
    });
  }

  async summarizeMembers(): Promise<string> {
    const members = await this.listMembers();
    if (members.length === 0) {
      return "No teammates.";
    }

    const config = await this.loadConfig();
    return [
      `Team: ${config.teamName}`,
      ...members.map((member) => `  ${member.name} (${member.role}): ${member.status}`),
    ].join("\n");
  }
}

function normalizeConfig(config: TeamConfigRecord): TeamConfigRecord {
  const members = Array.isArray(config.members) ? config.members.map((member) => normalizeMember(member)) : [];
  return {
    teamName: normalizeText(config.teamName) || "default",
    members: members.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function normalizeMember(member: TeamMemberRecord): TeamMemberRecord {
  const now = new Date().toISOString();
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

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
