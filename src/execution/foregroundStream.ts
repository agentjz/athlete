import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";

export const FOREGROUND_STREAM_PROTOCOL = "kitty.execution-foreground-stream" as const;

export interface ForegroundStreamRef {
  protocol: typeof FOREGROUND_STREAM_PROTOCOL;
  executionId: string;
  label: string;
  path: string;
  createdAt: string;
}

export function getForegroundStreamPath(rootDir: string, executionId: string): string {
  return path.join(getProjectStatePaths(rootDir).kittyDir, "execution-streams", `${executionId}.jsonl`);
}

export async function createForegroundStreamRef(input: {
  rootDir: string;
  executionId: string;
  label: string;
}): Promise<ForegroundStreamRef> {
  const file = getForegroundStreamPath(input.rootDir, input.executionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "", { encoding: "utf8", flag: "a" });
  return {
    protocol: FOREGROUND_STREAM_PROTOCOL,
    executionId: input.executionId,
    label: input.label,
    path: file,
    createdAt: new Date().toISOString(),
  };
}

export async function appendForegroundStreamEvent(input: {
  rootDir: string;
  executionId: string;
  label: string;
  message: string;
  level?: "info" | "warn" | "error";
  data?: Record<string, unknown>;
}): Promise<void> {
  const file = getForegroundStreamPath(input.rootDir, input.executionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(
    file,
    `${JSON.stringify({
      protocol: FOREGROUND_STREAM_PROTOCOL,
      executionId: input.executionId,
      label: input.label,
      level: input.level ?? "info",
      message: input.message,
      data: input.data,
      createdAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
}

export async function readForegroundStreamText(rootDir: string, executionId: string): Promise<string> {
  const file = getForegroundStreamPath(rootDir, executionId);
  const content = await fs.readFile(file, "utf8").catch(() => "");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as { label?: string; message?: string };
        const label = parsed.label || "execution";
        return `[${label}] ${parsed.message ?? ""}`.trimEnd();
      } catch {
        return line;
      }
    })
    .join("\n");
}
