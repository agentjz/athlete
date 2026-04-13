import { withProjectLedger } from "../control/ledger/open.js";
import { TaskLedgerRepo } from "../control/ledger/taskRepo.js";
import { WorktreeLedgerRepo, normalizeWorktreeName } from "../control/ledger/worktreeRepo.js";

export async function bindTaskToWorktree(rootDir: string, worktreeName: string, taskId: number): Promise<void> {
  await withProjectLedger(rootDir, ({ db }) => {
    const worktree = new WorktreeLedgerRepo(db).get(worktreeName);
    new TaskLedgerRepo(db).bindWorktree(taskId, worktree.name);
  });
}

export async function reserveAvailableWorktreeName(rootDir: string, baseName: string): Promise<string> {
  const normalizedBase = normalizeWorktreeName(baseName) || "task";
  const existing = new Set((await withProjectLedger(rootDir, ({ db }) => new WorktreeLedgerRepo(db).list()))
    .map((item) => item.name));
  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${normalizedBase}-${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to reserve a worktree name from '${baseName}'.`);
}

export async function resolveTaskCwdFromLedger(rootDir: string, taskId: number): Promise<string> {
  return withProjectLedger(rootDir, ({ db }) => {
    const task = new TaskLedgerRepo(db).load(taskId);
    if (!task.worktree) {
      return rootDir;
    }
    const worktree = new WorktreeLedgerRepo(db).find(task.worktree);
    if (!worktree || worktree.status === "removed") {
      return rootDir;
    }
    return worktree.path;
  });
}
