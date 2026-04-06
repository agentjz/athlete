import { createMessage } from "../agent/messages.js";
import { createEmptyTaskState, createInternalReminder } from "../agent/taskState.js";
import { BackgroundJobStore } from "../background/store.js";
import { spawnBackgroundProcess as defaultSpawnBackgroundProcess } from "../background/spawn.js";
import { runSubagentTask as defaultRunSubagentTask } from "../subagent/run.js";
import { MessageBus } from "../team/messageBus.js";
import { TeamStore } from "../team/store.js";
import { spawnTeammateProcess as defaultSpawnTeammateProcess } from "../team/spawn.js";
import { TaskStore } from "../tasks/store.js";
import { createToolRegistry } from "../tools/index.js";
import { WorktreeStore } from "../worktrees/store.js";
import { normalizeBackgroundCommand } from "./commandNormalization.js";
import { readOrchestratorMetadata, writeOrchestratorMetadata } from "./metadata.js";
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
    spawnTeammateProcess: input.deps?.spawnTeammateProcess ?? defaultSpawnTeammateProcess,
    spawnBackgroundProcess: input.deps?.spawnBackgroundProcess ?? defaultSpawnBackgroundProcess,
  };
  const taskStore = new TaskStore(input.rootDir);
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

      await claimForLead(taskStore, task.record.id);
      const result = await deps.runSubagentTask({
        description: task.record.subject,
        prompt: buildSubagentPrompt(input.analysis, task.record.id, task.record.subject),
        agentType: input.decision.subagentType ?? "explore",
        cwd: input.cwd,
        config: input.config,
        callbacks: input.callbacks,
      });
      await taskStore.update(task.record.id, {
        status: "completed",
        owner: "lead",
      });
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator delegated Task #${task.record.id} to a subagent and completed it.\n<subagent-result>${result.content}</subagent-result>`,
      );
      break;
    }

    case "delegate_teammate": {
      const task = input.decision.task;
      const teammate = input.decision.teammate;
      if (!task || !teammate) {
        return { session, decision: input.decision };
      }

      await taskStore.assign(task.record.id, teammate.name);
      await patchTaskMetadata(taskStore, task.record.id, {
        delegatedTo: teammate.name,
      });
      const teamStore = new TeamStore(input.rootDir);
      const existing = await teamStore.findMember(teammate.name);
      const prompt = buildTeammatePrompt(input.analysis, task.record.id, task.record.subject);
      if (!existing || existing.status === "shutdown" || typeof existing.pid !== "number") {
        const pid = deps.spawnTeammateProcess({
          rootDir: input.rootDir,
          config: input.config,
          name: teammate.name,
          role: teammate.role,
          prompt,
        });
        await teamStore.upsertMember(teammate.name, teammate.role, "working", {
          pid,
          sessionId: existing?.sessionId,
        });
      }

      await new MessageBus(input.rootDir)
        .send("lead", teammate.name, prompt, "message")
        .catch(() => null);
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator assigned Task #${task.record.id} to teammate '${teammate.name}'.`,
      );
      break;
    }

    case "run_in_background": {
      const command = normalizeBackgroundCommand(input.decision.backgroundCommand ?? input.analysis.backgroundCommand);
      if (!command) {
        return { session, decision: input.decision };
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
      const pid = deps.spawnBackgroundProcess({
        rootDir: input.rootDir,
        jobId: job.id,
      });
      await store.setPid(job.id, pid);
      if (input.decision.task) {
        await claimForLead(taskStore, input.decision.task.record.id);
        await patchTaskMetadata(taskStore, input.decision.task.record.id, {
          backgroundCommand: command,
          jobId: job.id,
        });
      }
      session = await appendOrchestratorNote(
        session,
        input.sessionStore,
        `Orchestrator started background job ${job.id} for '${command}'.`,
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
      if (input.decision.task && (!input.decision.task.record.owner || input.decision.task.record.owner === "lead")) {
        await claimForLead(taskStore, input.decision.task.record.id);
        session = await appendOrchestratorNote(
          session,
          input.sessionStore,
          `Orchestrator kept Task #${input.decision.task.record.id} on the lead for direct execution.`,
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
