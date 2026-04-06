import process from "node:process";

import { runManagedAgentTurn } from "../agent/managedTurn.js";
import { SessionStore } from "../agent/sessionStore.js";
import type { RuntimeConfig } from "../types.js";
import { MessageBus } from "./messageBus.js";
import { reconcileTeamState } from "./reconcile.js";
import { TeamStore } from "./store.js";
import { TaskStore } from "../tasks/store.js";
import { WorktreeStore } from "../worktrees/store.js";

export interface TeammateWorkerOptions {
  rootDir: string;
  config: RuntimeConfig;
  name: string;
  role: string;
  prompt: string;
}

const POLL_INTERVAL_MS = 2_000;

class TeammateShutdownError extends Error {
  constructor() {
    super("Teammate shutdown requested.");
  }
}

export async function runTeammateWorker(options: TeammateWorkerOptions): Promise<void> {
  const sessionStore = new SessionStore(options.config.paths.sessionsDir);
  const teamStore = new TeamStore(options.rootDir);
  const taskStore = new TaskStore(options.rootDir);
  const bus = new MessageBus(options.rootDir);
  const existingMember = await teamStore.findMember(options.name);
  let session =
    existingMember?.sessionId
      ? await tryLoadSession(sessionStore, existingMember.sessionId)
      : null;

  if (!session) {
    session = await sessionStore.create(options.rootDir);
  }

  await teamStore.upsertMember(options.name, options.role, "working", {
    sessionId: session.id,
    pid: process.pid,
  });

  let bootstrapPending = true;

  while (true) {
    await reconcileTeamState(options.rootDir).catch(() => null);
    const member = await teamStore.findMember(options.name);
    if (!member || member.status === "shutdown") {
      return;
    }

    const workItems: Array<{ input: string; cwd: string }> = [];
    if (bootstrapPending) {
      workItems.push({
        input: options.prompt,
        cwd: options.rootDir,
      });
      bootstrapPending = false;
    }

    const inbox = await bus.peekInbox(options.name);
    if (inbox.length > 0) {
      workItems.push({
        input: "[internal] Pending inbox updates detected. Read and handle them before continuing the current task.",
        cwd: options.rootDir,
      });
    }

    if (workItems.length === 0) {
      const claimable = await taskStore.listClaimable(options.name);
      const nextTask = claimable[0];
      if (nextTask) {
        await taskStore.claim(nextTask.id, options.name);
        let taskCwd = options.rootDir;
        let worktreeNote = "";
        try {
          const worktree = await new WorktreeStore(options.rootDir).ensureForTask(nextTask.id, nextTask.subject);
          taskCwd = worktree.path;
          worktreeNote = `\n<worktree name="${worktree.name}" path="${worktree.path}" branch="${worktree.branch}" />`;
        } catch (error) {
          worktreeNote = `\n<worktree-error>${String((error as { message?: unknown }).message ?? error)}</worktree-error>`;
        }

        workItems.push({
          cwd: taskCwd,
          input:
            `<auto-claimed>Task #${nextTask.id}: ${nextTask.subject}\n${nextTask.description}</auto-claimed>` +
            worktreeNote,
        });
      }
    }

    if (workItems.length === 0) {
      await teamStore.updateMemberStatus(options.name, "idle", process.pid);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    await teamStore.updateMemberStatus(options.name, "working", process.pid);

    for (const workItem of workItems) {
      try {
        const result = await runManagedAgentTurn({
          input: workItem.input,
          cwd: workItem.cwd,
          config: options.config,
          session,
          sessionStore,
          identity: {
            kind: "teammate",
            name: options.name,
            role: options.role,
            teamName: (await teamStore.loadConfig()).teamName,
          },
          onYield: async ({ defaultInput }) => {
            const memberAfterSlice = await teamStore.findMember(options.name);
            if (!memberAfterSlice || memberAfterSlice.status === "shutdown") {
              throw new TeammateShutdownError();
            }

            const urgentInbox = await bus.peekInbox(options.name);
            return {
              input:
                urgentInbox.length > 0
                  ? "[internal] New inbox updates are pending. Read and handle them, then continue the task."
                  : defaultInput,
            };
          },
        });
        session = result.session;

        const memberAfterTurn = await teamStore.findMember(options.name);
        if (!memberAfterTurn || memberAfterTurn.status === "shutdown") {
          return;
        }

        if (result.paused) {
          return;
        }
      } catch (error) {
        if (error instanceof TeammateShutdownError) {
          return;
        }

        throw error;
      }
    }
  }
}

async function tryLoadSession(sessionStore: SessionStore, sessionId: string) {
  try {
    return await sessionStore.load(sessionId);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
