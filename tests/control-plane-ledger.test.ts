import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { BackgroundJobStore } from "../src/execution/background.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { CoordinationPolicyStore } from "../src/team/policyStore.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { TeamStore } from "../src/team/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { WorktreeStore } from "../src/worktrees/store.js";
import { createTempWorkspace, initGitRepo } from "./helpers.js";

const LEGACY_TRUTH_SOURCE_PATHS = [
  path.join(".athlete", "tasks"),
  path.join(".athlete", "team", "config.json"),
  path.join(".athlete", "team", "policy.json"),
  path.join(".athlete", "team", "requests"),
  path.join(".athlete", "team", "background"),
  path.join(".athlete", "worktrees", "index.json"),
];

test("control-plane stores bootstrap a sqlite ledger and reload persisted state without legacy JSON truth files", async (t) => {
  const root = await createTempWorkspace("ledger-bootstrap", t);
  await initGitRepo(root);

  const taskStore = new TaskStore(root);
  const teamStore = new TeamStore(root);
  const requestStore = new ProtocolRequestStore(root);
  const policyStore = new CoordinationPolicyStore(root);
  const backgroundStore = new BackgroundJobStore(root);
  const worktreeStore = new WorktreeStore(root);

  const task = await taskStore.create("ledger bootstrap", "", { assignee: "alpha" });
  await taskStore.setChecklist(task.id, [
    { id: "1", text: "inspect", status: "completed" },
    { id: "2", text: "implement", status: "in_progress" },
  ]);
  const claimed = await taskStore.claim(task.id, "alpha");

  await teamStore.upsertMember("alpha", "implementer", "working", {
    sessionId: "session-alpha",
    pid: 2345,
  });
  await policyStore.update({
    allowPlanDecisions: true,
    allowShutdownRequests: true,
  });

  const pendingRequest = await requestStore.create({
    kind: "plan_approval",
    from: "alpha",
    to: "lead",
    subject: "Pending review",
    content: "pending",
  });
  const approvedRequest = await requestStore.create({
    kind: "shutdown",
    from: "lead",
    to: "alpha",
    subject: "Approve shutdown",
    content: "approved",
  });
  const rejectedRequest = await requestStore.create({
    kind: "plan_approval",
    from: "beta",
    to: "lead",
    subject: "Reject review",
    content: "rejected",
  });
  await requestStore.resolve(approvedRequest.id, {
    approve: true,
    feedback: "ok",
    respondedBy: "lead",
  });
  await requestStore.resolve(rejectedRequest.id, {
    approve: false,
    feedback: "no",
    respondedBy: "lead",
  });

  const runningJob = await backgroundStore.create({
    command: "npm run watch",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 20_000,
  });
  const completedJob = await backgroundStore.create({
    command: "npm test",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 20_000,
  });
  const failedJob = await backgroundStore.create({
    command: "npm run broken",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 20_000,
  });
  const timedOutJob = await backgroundStore.create({
    command: "npm run hung",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 20_000,
  });
  await backgroundStore.complete(completedJob.id, {
    status: "completed",
    exitCode: 0,
    output: "ok",
  });
  await backgroundStore.complete(failedJob.id, {
    status: "failed",
    exitCode: 1,
    output: "boom",
  });
  await backgroundStore.complete(timedOutJob.id, {
    status: "timed_out",
    exitCode: 124,
    output: "timeout",
  });

  const worktree = await worktreeStore.create("ledger-bootstrap", claimed.id);

  const ledgerFile = path.join(root, ".athlete", "control-plane.sqlite");
  assert.equal(await pathExists(ledgerFile), true);
  for (const relativePath of LEGACY_TRUTH_SOURCE_PATHS) {
    assert.equal(await pathExists(path.join(root, relativePath)), false, `${relativePath} should be retired`);
  }

  const reloadedTask = await new TaskStore(root).load(claimed.id);
  assert.equal(reloadedTask.owner, "alpha");
  assert.equal(reloadedTask.worktree, worktree.name);
  assert.equal(reloadedTask.checklist?.length, 2);

  const reloadedMembers = await new TeamStore(root).listMembers();
  assert.deepEqual(
    reloadedMembers.map((member) => ({
      name: member.name,
      role: member.role,
      status: member.status,
      sessionId: member.sessionId,
      pid: member.pid,
    })),
    [
      {
        name: "alpha",
        role: "implementer",
        status: "working",
        sessionId: "session-alpha",
        pid: 2345,
      },
    ],
  );

  const reloadedPolicy = await new CoordinationPolicyStore(root).load();
  assert.equal(reloadedPolicy.allowPlanDecisions, true);
  assert.equal(reloadedPolicy.allowShutdownRequests, true);

  const reloadedRequests = await new ProtocolRequestStore(root).list();
  const requestStatusById = new Map(reloadedRequests.map((request) => [request.id, request.status]));
  assert.equal(requestStatusById.get(pendingRequest.id), "pending");
  assert.equal(requestStatusById.get(approvedRequest.id), "approved");
  assert.equal(requestStatusById.get(rejectedRequest.id), "rejected");

  const reloadedJobs = await new BackgroundJobStore(root).list();
  const jobStatusById = new Map(reloadedJobs.map((job) => [job.id, job.status]));
  assert.equal(jobStatusById.get(runningJob.id), "running");
  assert.equal(jobStatusById.get(completedJob.id), "completed");
  assert.equal(jobStatusById.get(failedJob.id), "failed");
  assert.equal(jobStatusById.get(timedOutJob.id), "timed_out");

  const reloadedWorktree = await new WorktreeStore(root).get(worktree.name);
  assert.equal(reloadedWorktree.taskId, claimed.id);
  assert.equal(reloadedWorktree.status, "active");
});

test("TaskStore arbitrates concurrent claims so only one actor can successfully own a task", async (t) => {
  const root = await createTempWorkspace("ledger-claim", t);
  const created = await new TaskStore(root).create("claim me once");

  const results = await Promise.allSettled([
    new TaskStore(root).claim(created.id, "alpha"),
    new TaskStore(root).claim(created.id, "beta"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const finalTask = await new TaskStore(root).load(created.id);
  const fulfilled = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<TaskStore["claim"]>>> => result.status === "fulfilled");
  assert.ok(fulfilled);
  assert.equal(finalTask.owner, fulfilled.value.owner);
  assert.equal(finalTask.status, "in_progress");
});

test("orchestrator ignores legacy JSON shadows and cleanup does not disturb ledger-backed control-plane state", async (t) => {
  const root = await createTempWorkspace("ledger-shadow", t);
  await initGitRepo(root);

  const task = await new TaskStore(root).create("real task");
  await new TeamStore(root).upsertMember("alpha", "implementer", "idle", {
    sessionId: "session-real",
    pid: 1001,
  });
  const realRequest = await new ProtocolRequestStore(root).create({
    kind: "plan_approval",
    from: "alpha",
    to: "lead",
    subject: "Real request",
    content: "real",
  });
  const realJob = await new BackgroundJobStore(root).create({
    command: "npm test",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 30_000,
  });
  const realWorktree = await new WorktreeStore(root).create("shadow-proof", task.id);

  await writeLegacyTruthSourceShadows(root);

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: {
      key: "shadow-proof",
      text: "Ignore legacy JSON shadows.",
    },
  });

  assert.deepEqual(progress.tasks.map((record) => record.id), [task.id]);
  assert.equal(progress.teammates.some((member) => member.name === "shadow-worker"), false);
  assert.equal(progress.teammates.some((member) => member.name === "alpha"), true);
  assert.equal(progress.protocolRequests.some((request) => request.id === "shadow-request"), false);
  assert.equal(progress.protocolRequests.some((request) => request.id === realRequest.id), true);
  assert.equal(progress.relevantBackgroundJobs.some((job) => job.id === "shadowjob"), false);
  assert.equal(progress.relevantBackgroundJobs.some((job) => job.id === realJob.id), true);
  assert.equal(progress.worktrees.some((worktree) => worktree.name === "shadow-lane"), false);
  assert.equal(progress.worktrees.some((worktree) => worktree.name === realWorktree.name), true);

  const reloadedTask = await new TaskStore(root).load(task.id);
  const reloadedWorktree = await new WorktreeStore(root).get(realWorktree.name);
  assert.equal(reloadedTask.worktree, realWorktree.name);
  assert.equal(reloadedWorktree.taskId, task.id);

  for (const relativePath of LEGACY_TRUTH_SOURCE_PATHS) {
    assert.equal(await pathExists(path.join(root, relativePath)), false, `${relativePath} should be cleaned`);
  }
});

async function writeLegacyTruthSourceShadows(root: string): Promise<void> {
  const athleteDir = path.join(root, ".athlete");
  const tasksDir = path.join(athleteDir, "tasks");
  const teamDir = path.join(athleteDir, "team");
  const requestsDir = path.join(teamDir, "requests");
  const backgroundDir = path.join(teamDir, "background");
  const worktreesDir = path.join(athleteDir, "worktrees");

  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(requestsDir, { recursive: true });
  await fs.mkdir(backgroundDir, { recursive: true });
  await fs.mkdir(worktreesDir, { recursive: true });

  await fs.writeFile(
    path.join(tasksDir, "task_999.json"),
    JSON.stringify({
      id: 999,
      subject: "shadow task",
      description: "shadow",
      status: "pending",
      blockedBy: [],
      blocks: [],
      assignee: "",
      owner: "",
      worktree: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(teamDir, "config.json"),
    JSON.stringify({
      teamName: "shadow-team",
      members: [
        {
          name: "shadow-worker",
          role: "implementer",
          status: "working",
          pid: 9999,
          sessionId: "shadow-session",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(teamDir, "policy.json"),
    JSON.stringify({
      allowPlanDecisions: false,
      allowShutdownRequests: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(requestsDir, "request_shadow-request.json"),
    JSON.stringify({
      id: "shadow-request",
      kind: "plan_approval",
      from: "shadow-worker",
      to: "lead",
      subject: "shadow",
      content: "shadow",
      status: "approved",
      decision: {
        approve: true,
        feedback: "shadow",
        respondedBy: "lead",
        respondedAt: "2026-01-01T00:00:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(backgroundDir, "job_shadowjob.json"),
    JSON.stringify({
      id: "shadowjob",
      command: "shadow command",
      cwd: root,
      requestedBy: "lead",
      status: "completed",
      timeoutMs: 30_000,
      stallTimeoutMs: 30_000,
      exitCode: 0,
      output: "shadow",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(worktreesDir, "index.json"),
    JSON.stringify({
      items: [
        {
          name: "shadow-lane",
          path: path.join(worktreesDir, "shadow-lane"),
          branch: "wt/shadow-lane",
          status: "active",
          taskId: 999,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, null, 2),
    "utf8",
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
