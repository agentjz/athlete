import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";

export class WebWorkbenchLog {
  private readonly filePath: string;

  constructor(rootDir: string, sessionId: string, now = new Date()) {
    const timestamp = now.toISOString();
    const date = timestamp.slice(0, 10).replaceAll("-", "");
    const dir = path.join(getProjectStatePaths(rootDir).observabilityDir, "web", date);
    this.filePath = path.join(dir, `${safePathPart(sessionId)}.jsonl`);
  }

  async write(event: Record<string, unknown>): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, "utf8");
    } catch {
      // Observability must not break the workbench path.
    }
  }
}

function safePathPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `session-${process.pid}`;
}
