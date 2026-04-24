import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../src/agent/session.js";
import { BackgroundJobStore } from "../src/execution/background.js";
import { CoordinationPolicyStore } from "../src/team/policyStore.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { TeamStore } from "../src/team/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { handleLocalCommand } from "../src/ui/localCommands.js";
import { WorktreeStore } from "../src/worktrees/store.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

test("reset clears project runtime state but preserves env files and unrelated sessions", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("reset-runtime", t);
  const unrelatedRoot = await createTempWorkspace("reset-runtime-unrelated", t);
  await initGitRepo(root);

  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const taskStore = new TaskStore(root);
  const backgroundStore = new BackgroundJobStore(root);
  const teamStore = new TeamStore(root);
  const requestStore = new ProtocolRequestStore(root);
  const worktreeStore = new WorktreeStore(root);
  const projectStateDir = path.join(root, ".deadmouse");

  await fs.mkdir(projectStateDir, { recursive: true });
  await fs.writeFile(path.join(projectStateDir, ".env"), "DEADMOUSE_API_KEY=test-key\n", "utf8");
  await fs.writeFile(path.join(projectStateDir, ".env.example"), "DEADMOUSE_API_KEY=\n", "utf8");
  await fs.mkdir(path.join(projectStateDir, "tool-results", "session-a"), { recursive: true });
  await fs.writeFile(path.join(projectStateDir, "tool-results", "session-a", "artifact.txt"), "artifact\n", "utf8");

  const task = await taskStore.create("reset me");
  await taskStore.claim(task.id, "lead");
  await requestStore.create({
    kind: "plan_approval",
    from: "alpha",
    to: "lead",
    subject: "review",
    content: "please",
  });
  await new CoordinationPolicyStore(root).save({
    allowPlanDecisions: true,
    allowShutdownRequests: false,
    updatedAt: new Date().toISOString(),
  });

  const worktree = await worktreeStore.create("reset-worktree", task.id);
  await fs.writeFile(path.join(worktree.path, "note.txt"), "worktree\n", "utf8");

  const backgroundChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: root,
    stdio: "ignore",
  });
  const teammateChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    cwd: root,
    stdio: "ignore",
  });

  t.after(() => {
    safeKill(backgroundChild.pid);
    safeKill(teammateChild.pid);
  });

  const backgroundJob = await backgroundStore.create({
    command: "node long-task.js",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 120_000,
  });
  await backgroundStore.setPid(backgroundJob.id, backgroundChild.pid ?? -1);
  await teamStore.upsertMember("alpha", "implementer", "working", {
    pid: teammateChild.pid ?? -1,
  });

  let currentSession = await sessionStore.create(root);
  currentSession = await sessionStore.save({
    ...currentSession,
    messages: [
      {
        role: "user",
        content: "reset this project",
        createdAt: new Date().toISOString(),
      },
    ],
  } as any);

  let descendantSession = await sessionStore.create(path.join(root, "pkg-a"));
  descendantSession = await sessionStore.save(descendantSession);

  let unrelatedSession = await sessionStore.create(unrelatedRoot);
  unrelatedSession = await sessionStore.save(unrelatedSession);

  const result = await handleLocalCommand("reset", {
    cwd: root,
    session: currentSession,
    config,
  });

  assert.equal(result, "quit");

  await waitForProcessExit(backgroundChild.pid ?? -1);
  await waitForProcessExit(teammateChild.pid ?? -1);

  assert.equal(await pathExists(path.join(projectStateDir, ".env")), true);
  assert.equal(await pathExists(path.join(projectStateDir, ".env.example")), true);
  assert.equal(await pathExists(path.join(projectStateDir, "control-plane.sqlite")), false);
  assert.equal(await pathExists(path.join(projectStateDir, "tasks")), false);
  assert.equal(await pathExists(path.join(projectStateDir, "team")), false);
  assert.equal(await pathExists(path.join(projectStateDir, "tool-results")), false);
  assert.equal(await pathExists(path.join(projectStateDir, "worktrees")), false);

  assert.equal(await pathExists(path.join(config.paths.sessionsDir, `${currentSession.id}.json`)), false);
  assert.equal(await pathExists(path.join(config.paths.sessionsDir, `${descendantSession.id}.json`)), false);
  assert.equal(await pathExists(path.join(config.paths.sessionsDir, `${unrelatedSession.id}.json`)), true);

  assert.equal(isProcessAlive(backgroundChild.pid ?? -1), false);
  assert.equal(isProcessAlive(teammateChild.pid ?? -1), false);

  const gitWorktrees = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  assert.doesNotMatch(gitWorktrees, new RegExp(escapeRegExp(worktree.path)));
});

test("reset command is available through slash-prefixed local command", async (t) => {
  const root = await createTempWorkspace("reset-command", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.create(root);
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.writeFile(path.join(root, ".deadmouse", ".env"), "DEADMOUSE_API_KEY=test-key\n", "utf8");

  const result = await handleLocalCommand("/reset", {
    cwd: root,
    session,
    config,
  });

  assert.equal(result, "quit");
  assert.equal(await pathExists(path.join(root, ".deadmouse", ".env")), true);
});

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function safeKill(pid: number | undefined): void {
  if (!pid || !isProcessAlive(pid)) {
    return;
  }

  try {
    process.kill(pid);
  } catch {
    // ignore cleanup failure in tests
  }
}

async function waitForProcessExit(pid: number, attempts = 40): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
