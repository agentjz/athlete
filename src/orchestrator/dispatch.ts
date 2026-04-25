import { createEmptyTaskState } from "../agent/session.js";
import { BackgroundJobStore } from "../execution/background.js";
import { spawnExecutionWorker as defaultSpawnExecutionWorker } from "../execution/launch.js";
import { ExecutionStore } from "../execution/store.js";
import { launchSubagentWorkerExecution } from "../subagent/launch.js";
import { TeamStore } from "../team/store.js";
import { TaskStore } from "../tasks/store.js";
import { WorktreeStore } from "../worktrees/store.js";
import { normalizeBackgroundCommand } from "./commandNormalization.js";
import { clearOrchestratorReturnBarrier, markOrchestratorReturnBarrierPending } from "./returnBarrier.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import {
  appendOrchestratorNote,
  assertTaskReadyFor,
  buildSubagentPrompt,
  buildTeammatePrompt,
  canLeadClaimTask,
  claimForLead,
  patchTaskMetadata,
} from "./dispatchHelpers.js";
import type {
  OrchestratorAnalysis,
  OrchestratorDecision,
  OrchestratorDispatchDependencies,
  PrepareLeadTurnOptions,
} from "./types.js";

export async function dispatchOrchestratorAction(input: {
  rootDir: string;
  cwd: string;
  config: PrepareLeadTurnOptions["config"];
  session: PrepareLeadTurnOptions["session"];
  sessionStore: PrepareLeadTurnOptions["sessionStore"];
  analysis: OrchestratorAnalysis;
  decision: OrchestratorDecision;
  callbacks?: PrepareLeadTurnOptions["callbacks"];
  deps?: OrchestratorDispatchDependencies;
}): Promise<{
  session: PrepareLeadTurnOptions["session"];
  decision: OrchestratorDecision;
}> {
  const deps = {
    spawnExecutionWorker: input.deps?.spawnExecutionWorker ?? defaultSpawnExecutionWorker,
  };
  const taskStore = new TaskStore(input.rootDir);
  const executionStore = new ExecutionStore(input.rootDir);
  let session = await input.sessionStore.save({
    ...input.session,
    taskState: {
      ...(input.session.taskState ?? createEmptyTaskState()),
      objective: input.analysis.objective.text,
      delegationDirective: input.analysis.delegationDirective,
      lastUpdatedAt: new Date().toISOString(),
    },
  });

  switch (input.decision.action) {
    case "delegate_subagent": {
      const task = input.decision.task;
      if (!task) {
        return { session, decision: input.decision };
      }
      assertTaskReadyFor("delegate_subagent", task, "lead");
      if (task.meta.executionId) {
        throw new Error(`Task #${task.record.id} already has execution '${task.meta.executionId}'.`);
      }

      const { execution } = await launchSubagentWorkerExecution({
        rootDir: input.rootDir,
        cwd: input.cwd,
        config: input.config,
        description: `Task #${task.record.id}: ${task.record.subject}`,
        prompt: buildSubagentPrompt(input.analysis, task.record.id, task.record.subject),
        agentType: input.decision.subagentType ?? "explore",
        requestedBy: "lead",
        taskId: task.record.id,
        actorName: `subagent-${task.record.id}`,
        worktreePolicy: input.decision.subagentType === "code" ? "task" : "none",
      }, {
        spawnExecutionWorker: deps.spawnExecutionWorker,
      });
      await patchTaskMetadata(taskStore, task.record.id, {
        executionId: execution.id,
      });
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator launched subagent execution '${execution.id}' for Task #${task.record.id}.`,
      );
      session = await input.sessionStore.save(markOrchestratorReturnBarrierPending(session, {
        action: "delegate_subagent",
        taskId: task.record.id,
      }));
      break;
    }

    case "delegate_teammate": {
      const task = input.decision.task;
      const teammate = input.decision.teammate;
      if (!task || !teammate) {
        return { session, decision: input.decision };
      }
      assertTaskReadyFor("delegate_teammate", task, "lead");
      if (task.meta.executionId) {
        throw new Error(`Task #${task.record.id} already has execution '${task.meta.executionId}'.`);
      }

      await taskStore.assign(task.record.id, teammate.name);
      const teamStore = new TeamStore(input.rootDir);
      const existing = await teamStore.findMember(teammate.name);
      const prompt = buildTeammatePrompt(input.analysis, task.record.id, task.record.subject);
      const execution = await executionStore.create({
        lane: "agent",
        profile: "teammate",
        launch: "worker",
        requestedBy: "lead",
        actorName: teammate.name,
        actorRole: teammate.role,
        taskId: task.record.id,
        cwd: input.cwd,
        prompt,
        worktreePolicy: "task",
      });
      const pid = deps.spawnExecutionWorker({
        rootDir: input.rootDir,
        config: input.config,
        executionId: execution.id,
        actorName: teammate.name,
      });
      await executionStore.start(execution.id, {
        pid,
      });
      await patchTaskMetadata(taskStore, task.record.id, {
        delegatedTo: teammate.name,
        executionId: execution.id,
      });
      await teamStore.upsertMember(teammate.name, teammate.role, "working", {
        pid,
        sessionId: existing?.sessionId,
      });
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator launched teammate execution '${execution.id}' for Task #${task.record.id} on '${teammate.name}'.`,
      );
      session = await input.sessionStore.save(markOrchestratorReturnBarrierPending(session, {
        action: "delegate_teammate",
        taskId: task.record.id,
      }));
      break;
    }

    case "run_in_background": {
      const command = normalizeBackgroundCommand(input.decision.backgroundCommand ?? input.analysis.backgroundCommand);
      if (!command) {
        return { session, decision: input.decision };
      }
      if (input.decision.task) {
        assertTaskReadyFor("run_in_background", input.decision.task, "lead");
        if (input.decision.task.meta.executionId) {
          throw new Error(`Task #${input.decision.task.record.id} already points to execution '${input.decision.task.meta.executionId}'.`);
        }
      }

      const cwd = input.decision.task
        ? await new WorktreeStore(input.rootDir).resolveTaskCwd(input.decision.task.record.id).catch(() => input.cwd)
        : input.cwd;
      const store = new BackgroundJobStore(input.rootDir);
      const job = await store.create({
        command,
        cwd,
        requestedBy: "lead",
        timeoutMs: 120_000,
        stallTimeoutMs: input.config.commandStallTimeoutMs,
      });
      const pid = deps.spawnExecutionWorker({
        rootDir: input.rootDir,
        config: input.config,
        executionId: job.id,
        actorName: `bg-${job.id}`,
      });
      await store.setPid(job.id, pid);
      if (input.decision.task) {
        await claimForLead(taskStore, input.decision.task.record.id);
        await patchTaskMetadata(taskStore, input.decision.task.record.id, {
          backgroundCommand: command,
          jobId: job.id,
          executionId: job.id,
        });
      }
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator launched background execution '${job.id}' for '${command}'.`,
      );
      session = await input.sessionStore.save(markOrchestratorReturnBarrierPending(session, {
        action: "run_in_background",
        taskId: input.decision.task?.record.id,
      }));
      break;
    }

    case "wait_for_existing_work": {
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        "Orchestrator is waiting for existing delegated work before issuing more dispatches.",
      );
      break;
    }

    case "self_execute":
    default: {
      session = await input.sessionStore.save(clearOrchestratorReturnBarrier(session));
      if (input.decision.task && canLeadClaimTask(input.decision.task)) {
        await claimForLead(taskStore, input.decision.task.record.id);
        session = await appendOrchestratorNote(
          session,
          input.sessionStore,
          `Orchestrator kept Task #${input.decision.task.record.id} on the lead for direct execution.`,
        );
      } else if (input.decision.task) {
        const lifecycle = getOrchestratorTaskLifecycle(input.decision.task);
        session = await appendOrchestratorNote(
          session,
          input.sessionStore,
          `Orchestrator blocked direct execution for Task #${input.decision.task.record.id} until the control plane is reconciled: ${lifecycle.reason}`,
        );
      }
      break;
    }
  }

  return {
    session,
    decision: input.decision,
  };
}
