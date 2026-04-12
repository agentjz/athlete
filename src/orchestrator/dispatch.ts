import { createMessage } from "../agent/session.js";
import { createEmptyTaskState, createInternalReminder } from "../agent/session.js";
import { BackgroundJobStore } from "../execution/background.js";
import { spawnExecutionWorker as defaultSpawnExecutionWorker } from "../execution/launch.js";
import { ExecutionStore } from "../execution/store.js";
import { runSubagentTask as defaultRunSubagentTask } from "../subagent/run.js";
import { TeamStore } from "../team/store.js";
import { TaskStore } from "../tasks/store.js";
import { createToolRegistry } from "../tools/index.js";
import { WorktreeStore } from "../worktrees/store.js";
import { normalizeBackgroundCommand } from "./commandNormalization.js";
import { readOrchestratorMetadata, writeOrchestratorMetadata } from "./metadata.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import type {
  OrchestratorAnalysis,
  OrchestratorDecision,
  OrchestratorDispatchDependencies,
  OrchestratorSubagentInput,
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
    runSubagentTask: input.deps?.runSubagentTask ?? (async (options: OrchestratorSubagentInput) =>
      defaultRunSubagentTask({
        ...options,
        createToolRegistry,
      })),
    spawnExecutionWorker: input.deps?.spawnExecutionWorker ?? defaultSpawnExecutionWorker,
  };
  const taskStore = new TaskStore(input.rootDir);
  const executionStore = new ExecutionStore(input.rootDir);
  let session = await input.sessionStore.save({
    ...input.session,
    taskState: {
      ...(input.session.taskState ?? createEmptyTaskState()),
      objective: input.analysis.objective.text,
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

      await claimForLead(taskStore, task.record.id);
      const result = await deps.runSubagentTask({
        description: task.record.subject,
        prompt: buildSubagentPrompt(input.analysis, task.record.id, task.record.subject),
        agentType: input.decision.subagentType ?? "explore",
        cwd: input.cwd,
        config: input.config,
        callbacks: input.callbacks,
        taskId: task.record.id,
        requestedBy: "lead",
        worktreePolicy: input.decision.subagentType === "code" ? "task" : "none",
      });
      await taskStore.update(task.record.id, {
        status: "completed",
        owner: "lead",
      });
      await patchTaskMetadata(taskStore, task.record.id, {
        executionId: result.executionId,
      });
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator delegated Task #${task.record.id} onto execution '${result.executionId}' and completed it.\n<subagent-result>${result.content}</subagent-result>`,
      );
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

async function claimForLead(taskStore: TaskStore, taskId: number): Promise<void> {
  const current = await taskStore.load(taskId);
  if (current.owner === "lead") {
    return;
  }

  if (!current.owner) {
    await taskStore.claim(taskId, "lead").catch(() => null);
  }
}

async function patchTaskMetadata(
  taskStore: TaskStore,
  taskId: number,
  patch: {
    backgroundCommand?: string;
    delegatedTo?: string;
    jobId?: string;
    executionId?: string;
  },
): Promise<void> {
  const task = await taskStore.load(taskId);
  const meta = readOrchestratorMetadata(task.description);
  if (!meta) {
    return;
  }

  await taskStore.save({
    ...task,
    description: writeOrchestratorMetadata(task.description, {
      ...meta,
      ...patch,
    }),
  });
}

async function appendOrchestratorNote(
  session: PrepareLeadTurnOptions["session"],
  sessionStore: PrepareLeadTurnOptions["sessionStore"],
  text: string,
): Promise<PrepareLeadTurnOptions["session"]> {
  const content = createInternalReminder(`Orchestrator: ${text}`);
  const recentDuplicate = session.messages
    .slice(-6)
    .some((message) => message.role === "user" && message.content === content);
  if (recentDuplicate) {
    return session;
  }

  return sessionStore.appendMessages(session, [
    createMessage("user", content),
  ]);
}

function buildSubagentPrompt(analysis: OrchestratorAnalysis, taskId: number, subject: string): string {
  return [
    `Focus on Task #${taskId}: ${subject}.`,
    `Objective: ${analysis.objective.text}`,
    "Return only the concrete facts the lead needs next. Do not make unrelated changes.",
  ].join("\n");
}

function buildTeammatePrompt(analysis: OrchestratorAnalysis, taskId: number, subject: string): string {
  return [
    `Claim Task #${taskId} from the persistent task board and execute only that scope.`,
    `Objective: ${analysis.objective.text}`,
    `Task focus: ${subject}`,
    "Keep the task board updated, use isolated worktrees when provided, and message the lead if you are blocked.",
  ].join("\n");
}

function assertTaskReadyFor(
  action: "delegate_subagent" | "delegate_teammate" | "run_in_background",
  task: NonNullable<OrchestratorDecision["task"]>,
  actorKind: "lead",
): void {
  const lifecycle = getOrchestratorTaskLifecycle(task);
  if (lifecycle.illegal) {
    throw new Error(`Task #${task.record.id} is not safe for ${action}: ${lifecycle.reason}`);
  }

  if (lifecycle.stage !== "ready" || lifecycle.runnableBy.kind !== actorKind) {
    throw new Error(`Task #${task.record.id} is not ready for ${action}: ${lifecycle.reason}`);
  }
}

function canLeadClaimTask(task: NonNullable<OrchestratorDecision["task"]>): boolean {
  const lifecycle = getOrchestratorTaskLifecycle(task);
  return !lifecycle.illegal && lifecycle.stage === "ready" && lifecycle.runnableBy.kind === "lead";
}
