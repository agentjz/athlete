import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { withProjectLedger } from "../../src/control/ledger/open.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { CoordinationPolicyStore } from "../../src/capabilities/team/policyStore.js";
import { ProtocolRequestStore } from "../../src/capabilities/team/requestStore.js";
import { TeamStore } from "../../src/capabilities/team/store.js";
import { TaskStore } from "../../src/tasks/store.js";
import { WorktreeStore } from "../../src/worktrees/store.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("control-plane stores bootstrap a sqlite ledger as the only control-plane truth source", async (t) => {
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
  await backgroundStore.setPid(completedJob.id, 2001);
  await backgroundStore.setPid(failedJob.id, 2002);
  await backgroundStore.setPid(timedOutJob.id, 2003);
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

  const ledgerFile = path.join(root, ".kitty", "control-plane.sqlite");
  assert.equal(await pathExists(ledgerFile), true);

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

test("control-plane stores fail closed when the teammate ledger is corrupt", async (t) => {
  const root = await createTempWorkspace("ledger-corrupt-team-members", t);
  await new TeamStore(root).upsertMember("worker-1", "implementer", "idle", {
    sessionId: "session-worker-1",
    pid: 1111,
  });
  await withProjectLedger(root, ({ db }) => {
    db.exec("DROP TABLE team_members");
  });

  await assert.rejects(
    () => new TeamStore(root).listMembers(),
    /team_members/i,
  );
});

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
