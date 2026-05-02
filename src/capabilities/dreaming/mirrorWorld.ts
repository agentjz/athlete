import path from "node:path";

import { WorktreeStore } from "../../worktrees/store.js";
import type { WorktreeRecord } from "../../worktrees/types.js";

export const MIRROR_WORLD_PROTOCOL = "kitty.mirror-world" as const;

export interface MirrorWorld {
  protocol: typeof MIRROR_WORLD_PROTOCOL;
  name: string;
  path: string;
  branch: string;
  realWorldPath: string;
}

export async function createDreamingMirrorWorld(input: {
  rootDir: string;
  executionId: string;
  name?: string;
}): Promise<MirrorWorld> {
  const worktree = await new WorktreeStore(input.rootDir).create(
    input.name || `dreaming-${input.executionId}`,
  );
  return toMirrorWorld(input.rootDir, worktree);
}

export function toMirrorWorld(rootDir: string, worktree: WorktreeRecord): MirrorWorld {
  return {
    protocol: MIRROR_WORLD_PROTOCOL,
    name: worktree.name,
    path: path.resolve(worktree.path),
    branch: worktree.branch,
    realWorldPath: path.resolve(rootDir),
  };
}
