import { createMessage, createInternalReminder } from "../agent/session.js";
import { TaskStore } from "../tasks/store.js";
import { readOrchestratorMetadata, writeOrchestratorMetadata } from "./metadata.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import type { OrchestratorAnalysis, OrchestratorDecision, PrepareLeadTurnOptions } from "./types.js";

export async function claimForLead(taskStore: TaskStore, taskId: number): Promise<void> {
  const current = await taskStore.load(taskId);
  if (current.owner === "lead") {
    return;
  }

  if (!current.owner) {
    await taskStore.claim(taskId, "lead").catch(() => null);
  }
}

export async function patchTaskMetadata(
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

export async function appendOrchestratorNote(
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

export function buildSubagentPrompt(analysis: OrchestratorAnalysis, taskId: number, subject: string): string {
  return [
    `Focus on Task #${taskId}: ${subject}.`,
    `Objective: ${analysis.objective.text}`,
    "Return only the concrete facts the lead needs next. Do not make unrelated changes.",
  ].join("\n");
}

export function buildTeammatePrompt(analysis: OrchestratorAnalysis, taskId: number, subject: string): string {
  return [
    `Claim Task #${taskId} from the persistent task board and execute only that scope.`,
    `Objective: ${analysis.objective.text}`,
    `Task focus: ${subject}`,
    "Keep the task board updated, use isolated worktrees when provided, and message the lead if you are blocked.",
  ].join("\n");
}

export function assertTaskReadyFor(
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

export function canLeadClaimTask(task: NonNullable<OrchestratorDecision["task"]>): boolean {
  const lifecycle = getOrchestratorTaskLifecycle(task);
  return !lifecycle.illegal && lifecycle.stage === "ready" && lifecycle.runnableBy.kind === "lead";
}
