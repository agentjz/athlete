import type { PromptRuntimeState } from "./systemPrompt.js";
import type { AgentIdentity, RunTurnOptions } from "./types.js";
import type { SessionRecord } from "../types.js";
import { CoordinationPolicyStore } from "../capabilities/team/policyStore.js";
import { ProtocolRequestStore } from "../capabilities/team/requestStore.js";
import { reconcileTeamState } from "../capabilities/team/reconcile.js";
import { TeamStore } from "../capabilities/team/store.js";
import { TaskStore } from "../tasks/store.js";
import { BackgroundJobStore, reconcileBackgroundJobs } from "../execution/background.js";
import { summarizeAgentExecutionsForPrompt } from "../execution/promptSummary.js";
import { buildObjectiveFrame, readObjectiveTaskMetadata } from "../objective/metadata.js";
import { WorktreeStore } from "../worktrees/store.js";
import { formatRuntimeCapabilityRegistryForLead } from "../capabilities/registry.js";
import type { LoadedSkill } from "../capabilities/skills/types.js";
import type { ToolRegistryEntry } from "../capabilities/tools/core/types.js";
import type { RuntimeConfig } from "../types.js";

export function shouldYieldTurn(yieldAfterToolSteps: number | undefined, iteration: number): boolean {
  return typeof yieldAfterToolSteps === "number" && Number.isFinite(yieldAfterToolSteps) && yieldAfterToolSteps > 0
    ? iteration > 0 && iteration % Math.trunc(yieldAfterToolSteps) === 0
    : false;
}

export async function injectInboxMessagesIfNeeded(
  session: SessionRecord,
  _options: RunTurnOptions,
  identity: AgentIdentity,
  rootDir: string,
): Promise<SessionRecord> {
  if (identity.kind === "subagent") {
    return session;
  }

  return session;
}

export async function loadPromptRuntimeState(
  rootDir: string,
  identity: AgentIdentity,
  cwd?: string,
  objectiveText?: string,
  capabilityInput: {
    skills?: readonly LoadedSkill[];
    toolEntries?: readonly ToolRegistryEntry[];
    mcpConfig?: RuntimeConfig["mcp"];
  } = {},
): Promise<PromptRuntimeState> {
  await reconcileTeamState(rootDir).catch(() => null);
  await reconcileBackgroundJobs(rootDir).catch(() => null);
  const objectiveKey = objectiveText ? buildObjectiveFrame(objectiveText).key : undefined;
  const [taskSummary, teamSummary, worktreeSummary, backgroundSummary, protocolSummary, coordinationPolicySummary] = await Promise.all([
    new TaskStore(rootDir).summarize({
      objectiveKey,
    }).catch(() => "No tasks."),
    objectiveKey
      ? summarizeAgentExecutionsForPrompt(rootDir, {
          objectiveKey,
        }).catch(() => "No teammates.")
      : new TeamStore(rootDir).summarizeMembers().catch(() => "No teammates."),
    summarizeWorktreesForPrompt(rootDir, objectiveKey).catch(() => "No worktrees."),
    new BackgroundJobStore(rootDir).summarize({
      cwd,
      requestedBy: identity.name,
      objectiveKey,
    }).catch(() => "No background jobs."),
    objectiveKey
      ? "No protocol requests."
      : new ProtocolRequestStore(rootDir).summarize().catch(() => "No protocol requests."),
    new CoordinationPolicyStore(rootDir).summarize().catch(() => "- plan decisions: locked\n- shutdown requests: locked"),
  ]);

  return {
    identity,
    taskSummary,
    teamSummary,
    worktreeSummary,
    backgroundSummary,
    protocolSummary,
    coordinationPolicySummary,
    capabilitySummary: identity.kind === "lead"
      ? formatRuntimeCapabilityRegistryForLead(capabilityInput, { maxPerKind: 4 })
      : undefined,
  };
}

async function summarizeWorktreesForPrompt(rootDir: string, objectiveKey: string | undefined): Promise<string> {
  const [worktrees, tasks] = await Promise.all([
    new WorktreeStore(rootDir).list(),
    new TaskStore(rootDir).list(),
  ]);
  if (worktrees.length === 0) {
    return "No worktrees.";
  }

  if (!objectiveKey) {
    return "No worktrees.";
  }

  const taskByWorktree = new Map(tasks.filter((task) => task.worktree).map((task) => [task.worktree, task]));
  const current = worktrees.filter((worktree) => {
    const task = taskByWorktree.get(worktree.name);
    return task ? readObjectiveTaskMetadata(task.description)?.key === objectiveKey : false;
  });
  const currentLines = current.map((worktree) => {
    const task = typeof worktree.taskId === "number" ? ` task=${worktree.taskId}` : "";
    return `- ${worktree.name}${task} status=${worktree.status}`;
  });

  if (currentLines.length === 0) {
    return "No worktrees.";
  }

  return currentLines.join("\n");
}
