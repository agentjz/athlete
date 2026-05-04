import path from "node:path";

import { parsePatch } from "diff";

import type {
  AgentCallbacks,
  BeforeToolCallHookContext,
  BeforeToolCallHookResult,
} from "../../agent/types.js";
import { loadExeca } from "../../utils/execa.js";
import { parseArgs } from "../tools/core/shared.js";
import { normalizeDiffPath } from "../tools/core/shared.js";

export const DREAMING_WRITE_BOUNDARY_PROTOCOL = "kitty.dreaming-write-boundary" as const;

const FILE_PATH_ARG_TOOLS = new Map<string, readonly string[]>([
  ["write_file", ["path"]],
  ["edit_file", ["path"]],
  ["write_docx", ["path"]],
  ["edit_docx", ["path"]],
  ["download_url", ["path"]],
]);

const BLOCKED_TOOLS = new Set([
  "background_run",
  "background_terminate",
  "broadcast",
  "claim_task",
  "coordination_policy",
  "plan_approval",
  "send_message",
  "shutdown_request",
  "shutdown_response",
  "spawn_teammate",
  "task",
  "task_create",
  "task_update",
  "todo_write",
  "undo_last_change",
  "worktree_create",
  "worktree_keep",
  "worktree_remove",
]);

export interface DreamingWriteBoundary {
  protocol: typeof DREAMING_WRITE_BOUNDARY_PROTOCOL;
  realWorldPath: string;
  mirrorWorldPath: string;
  realWorldBaseline?: readonly string[];
}

export function createDreamingWriteBoundary(input: {
  realWorldPath: string;
  mirrorWorldPath: string;
  realWorldBaseline?: readonly string[];
}): DreamingWriteBoundary {
  return {
    protocol: DREAMING_WRITE_BOUNDARY_PROTOCOL,
    realWorldPath: path.resolve(input.realWorldPath),
    mirrorWorldPath: path.resolve(input.mirrorWorldPath),
    realWorldBaseline: input.realWorldBaseline ? [...input.realWorldBaseline] : undefined,
  };
}

export function createDreamingBoundaryCallbacks(input: {
  boundary: DreamingWriteBoundary;
  base: AgentCallbacks;
}): AgentCallbacks {
  return {
    ...input.base,
    async beforeToolCall(context) {
      const local = enforceDreamingToolBoundary(context, input.boundary);
      if (local?.block) {
        return local;
      }
      return input.base.beforeToolCall?.(context);
    },
  };
}

export function enforceDreamingToolBoundary(
  context: BeforeToolCallHookContext,
  boundary: DreamingWriteBoundary,
): BeforeToolCallHookResult | undefined {
  const toolName = context.toolCall.function.name;
  if (BLOCKED_TOOLS.has(toolName)) {
    return block(`Dreaming cannot call '${toolName}'. It must stay inside its own mirror-world execution channel.`);
  }

  let args: Record<string, unknown>;
  try {
    args = parseArgs(context.toolCall.function.arguments);
  } catch {
    return undefined;
  }

  if (toolName === "run_shell") {
    const cwd = typeof args.cwd === "string" && args.cwd.trim().length > 0
      ? args.cwd
      : boundary.mirrorWorldPath;
    const resolvedCwd = resolveAgainst(cwd, boundary.mirrorWorldPath);
    if (!isInsidePath(resolvedCwd, boundary.mirrorWorldPath)) {
      return block(`Dreaming shell cwd must stay inside Mirror World: ${boundary.mirrorWorldPath}`);
    }
    return undefined;
  }

  if (toolName === "patch_file") {
    const patchText = typeof args.patch === "string" ? args.patch : "";
    for (const patch of parsePatch(patchText)) {
      const targetPath = normalizeDiffPath(patch.newFileName) ?? normalizeDiffPath(patch.oldFileName);
      if (!targetPath) {
        continue;
      }
      const resolved = resolveAgainst(targetPath, boundary.mirrorWorldPath);
      if (!isInsidePath(resolved, boundary.mirrorWorldPath)) {
        return block(`Dreaming patch path must stay inside Mirror World: ${targetPath}`);
      }
    }
    return undefined;
  }

  const pathArgs = FILE_PATH_ARG_TOOLS.get(toolName) ?? [];
  for (const argName of pathArgs) {
    const value = args[argName];
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }
    const resolved = resolveAgainst(value, boundary.mirrorWorldPath);
    if (!isInsidePath(resolved, boundary.mirrorWorldPath)) {
      return block(`Dreaming write path must stay inside Mirror World: ${value}`);
    }
  }

  return undefined;
}

export async function snapshotRealWorldGitStatus(rootDir: string): Promise<string[]> {
  const execa = await loadExeca();
  const { stdout } = await execa("git", ["-C", rootDir, "status", "--porcelain=v1", "--untracked-files=normal"], {
    reject: true,
    timeout: 120_000,
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isRuntimeStateStatusLine(line));
}

export async function assertRealWorldGitUnchanged(
  rootDir: string,
  baseline: readonly string[] = [],
): Promise<void> {
  const before = normalizeStatusLines(baseline);
  const after = normalizeStatusLines(await snapshotRealWorldGitStatus(rootDir));
  if (!sameStatusLines(before, after)) {
    throw new Error(`Dreaming Real World boundary violation: before=[${before.join("; ")}] after=[${after.join("; ")}]`);
  }
}

function block(reason: string): BeforeToolCallHookResult {
  return {
    block: true,
    reason,
  };
}

function resolveAgainst(inputPath: string, cwd: string): string {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  return path.resolve(cwd, inputPath);
}

function isInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isRuntimeStateStatusLine(line: string): boolean {
  const pathPart = line.slice(3).replace(/\\/g, "/");
  return pathPart === ".kitty" || pathPart.startsWith(".kitty/");
}

function normalizeStatusLines(lines: readonly string[]): string[] {
  return [...lines].map((line) => line.trimEnd()).filter(Boolean).sort();
}

function sameStatusLines(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((line, index) => line === right[index]);
}
