import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import type { MirrorWorld } from "./mirrorWorld.js";

export const DREAMING_STATE_PROTOCOL = "kitty.dreaming-state" as const;

export interface DreamingState {
  protocol: typeof DREAMING_STATE_PROTOCOL;
  executionId: string;
  objective: string;
  scope: string;
  expectedOutput: string;
  mirrorWorld?: MirrorWorld;
  foregroundStreamPath?: string;
  mergeProposalPath?: string;
  status: "created" | "running" | "completed" | "failed" | "paused";
  createdAt: string;
  updatedAt: string;
}

export function getDreamingDir(rootDir: string, executionId: string): string {
  return path.join(getProjectStatePaths(rootDir).kittyDir, "dreaming", executionId);
}

export function getDreamingStatePath(rootDir: string, executionId: string): string {
  return path.join(getDreamingDir(rootDir, executionId), "state.json");
}

export async function writeDreamingState(rootDir: string, state: DreamingState): Promise<void> {
  const file = getDreamingStatePath(rootDir, state.executionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({
    ...state,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}

export async function readDreamingState(rootDir: string, executionId: string): Promise<DreamingState> {
  return JSON.parse(await fs.readFile(getDreamingStatePath(rootDir, executionId), "utf8")) as DreamingState;
}
