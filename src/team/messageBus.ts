import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import { TEAM_PROTOCOL_VERSION } from "./types.js";
import {
  buildProtocolErrorMessage,
  isValidTeamMessageType,
  normalizeTeamActorName,
  safeParseTeamMessageLine,
  validateTeamMessage,
} from "./messageProtocol.js";
import type { TeamMessageRecord, TeamMessageType } from "./types.js";

export class MessageBus {
  constructor(private readonly rootDir: string) {}

  async send(
    sender: string,
    to: string,
    content: string,
    type: TeamMessageType = "message",
    extra: Partial<TeamMessageRecord> = {},
  ): Promise<TeamMessageRecord> {
    if (!isValidTeamMessageType(type)) {
      throw new Error(`Invalid message type: ${type}`);
    }

    const normalizedTo = normalizeTeamActorName(to);
    if (!normalizedTo) {
      throw new Error("Target teammate name is required.");
    }

    const paths = await ensureProjectStateDirectories(this.rootDir);
    const message: TeamMessageRecord = {
      protocolVersion: TEAM_PROTOCOL_VERSION,
      type,
      from: normalizeTeamActorName(sender) || "lead",
      to: normalizedTo,
      content: String(content ?? ""),
      timestamp: Date.now(),
      protocolKind: typeof extra.protocolKind === "string" ? extra.protocolKind : undefined,
      requestId: typeof extra.requestId === "string" ? extra.requestId : undefined,
      subject: typeof extra.subject === "string" ? extra.subject : undefined,
      approve: typeof extra.approve === "boolean" ? extra.approve : undefined,
      feedback: typeof extra.feedback === "string" ? extra.feedback : undefined,
      exitCode: typeof extra.exitCode === "number" && Number.isFinite(extra.exitCode) ? Math.trunc(extra.exitCode) : undefined,
      executionId: typeof extra.executionId === "string" ? extra.executionId : undefined,
      executionStatus: typeof extra.executionStatus === "string" ? extra.executionStatus : undefined,
      executionProfile: typeof extra.executionProfile === "string" ? extra.executionProfile : undefined,
      taskId: typeof extra.taskId === "number" && Number.isFinite(extra.taskId) ? Math.trunc(extra.taskId) : undefined,
    };
    const validation = validateTeamMessage(message);
    if (!validation.ok) {
      throw new Error(`Invalid team protocol message: ${validation.error}`);
    }

    const inboxPath = path.join(paths.inboxDir, `${normalizedTo}.jsonl`);
    await fs.appendFile(paths.messageLogFile, `${JSON.stringify(message)}\n`, "utf8");
    await fs.appendFile(inboxPath, `${JSON.stringify(message)}\n`, "utf8");
    return message;
  }

  async readInbox(name: string): Promise<TeamMessageRecord[]> {
    const inboxPath = path.join(getProjectStatePaths(this.rootDir).inboxDir, `${normalizeTeamActorName(name) || "lead"}.jsonl`);
    const messages = await this.peekInbox(name);
    if (messages.length === 0) {
      return [];
    }

    await fs.writeFile(inboxPath, "", "utf8");
    return messages;
  }

  async peekInbox(name: string): Promise<TeamMessageRecord[]> {
    const inboxPath = path.join(getProjectStatePaths(this.rootDir).inboxDir, `${normalizeTeamActorName(name) || "lead"}.jsonl`);
    try {
      const raw = await fs.readFile(inboxPath, "utf8");
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const messages: TeamMessageRecord[] = [];

      for (const line of lines) {
        const parsed = safeParseTeamMessageLine(line);
        if (!parsed.ok) {
          messages.push(buildProtocolErrorMessage(`Invalid JSON: ${parsed.error}`, line));
          continue;
        }

        const validation = validateTeamMessage(parsed.value);
        if (!validation.ok) {
          messages.push(buildProtocolErrorMessage(validation.error, parsed.value));
          continue;
        }

        messages.push(validation.message);
      }

      return messages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async broadcast(sender: string, content: string, recipients: string[]): Promise<number> {
    let count = 0;
    for (const recipient of recipients) {
      if (normalizeTeamActorName(recipient) === normalizeTeamActorName(sender)) {
        continue;
      }

      await this.send(sender, recipient, content, "broadcast");
      count += 1;
    }

    return count;
  }
}
