import { createMessage } from "./session/messages.js";
import { createInternalReminder } from "./session/taskState.js";
import type { PromptRuntimeState } from "./systemPrompt.js";
import type { AgentIdentity, RunTurnOptions } from "./types.js";
import type { SessionRecord } from "../types.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { MessageBus } from "../team/messageBus.js";
import { CoordinationPolicyStore } from "../team/policyStore.js";
import { ProtocolRequestStore } from "../team/requestStore.js";
import { reconcileTeamState } from "../team/reconcile.js";
import { TeamStore } from "../team/store.js";
import { TaskStore } from "../tasks/store.js";
import { BackgroundJobStore, reconcileBackgroundJobs } from "../execution/background.js";
import { summarizeAgentExecutionsForPrompt } from "../execution/promptSummary.js";
import { buildOrchestratorObjective } from "../orchestrator/metadata.js";
import { WorktreeStore } from "../worktrees/store.js";
import { formatCapabilityRegistryForLead } from "../protocol/registry.js";
import { listSubagentCapabilityProfiles } from "../subagent/profiles.js";
import { getTeamCapabilityProfile } from "../team/profiles.js";
import { listWorkflowProfiles } from "../workflows/registry.js";

export function shouldYieldTurn(yieldAfterToolSteps: number | undefined, iteration: number): boolean {
  return typeof yieldAfterToolSteps === "number" && Number.isFinite(yieldAfterToolSteps) && yieldAfterToolSteps > 0
    ? iteration > 0 && iteration % Math.trunc(yieldAfterToolSteps) === 0
    : false;
}

export async function injectInboxMessagesIfNeeded(
  session: SessionRecord,
  options: RunTurnOptions,
  identity: AgentIdentity,
  rootDir: string,
): Promise<SessionRecord> {
  if (identity.kind === "subagent") {
    return session;
  }

  const bus = new MessageBus(getProjectStatePaths(rootDir).rootDir);
  const inbox = await bus.readInbox(identity.name);
  if (inbox.length === 0) {
    return session;
  }

  const reminder =
    identity.kind === "lead"
      ? `Inbox updates arrived from teammates. Review and handle them.\n<inbox>${JSON.stringify(inbox, null, 2)}</inbox>`
      : `Inbox updates arrived while you were working. Review and handle them before continuing.\n<inbox>${JSON.stringify(inbox, null, 2)}</inbox>`;

  return options.sessionStore.appendMessages(session, [
    createMessage(
      "user",
      createInternalReminder(reminder),
    ),
  ]);
}

export async function loadPromptRuntimeState(
  rootDir: string,
  identity: AgentIdentity,
  cwd?: string,
  objectiveText?: string,
): Promise<PromptRuntimeState> {
  await reconcileTeamState(rootDir).catch(() => null);
  await reconcileBackgroundJobs(rootDir).catch(() => null);
  const objectiveKey = objectiveText ? buildOrchestratorObjective(objectiveText).key : undefined;
  const [taskSummary, teamSummary, worktreeSummary, backgroundSummary, protocolSummary, coordinationPolicySummary] = await Promise.all([
    new TaskStore(rootDir).summarize({
      objectiveKey,
      includeCarryoverCount: Boolean(objectiveKey),
    }).catch(() => "No tasks."),
    objectiveKey
      ? summarizeAgentExecutionsForPrompt(rootDir, {
          objectiveKey,
          includeCarryoverCount: true,
        }).catch(() => "No teammates.")
      : new TeamStore(rootDir).summarizeMembers().catch(() => "No teammates."),
    new WorktreeStore(rootDir).summarize().catch(() => "No worktrees."),
    new BackgroundJobStore(rootDir).summarize({
      cwd,
      requestedBy: identity.name,
      objectiveKey,
      includeCarryoverCount: Boolean(objectiveKey),
    }).catch(() => "No background jobs."),
    objectiveKey
      ? new ProtocolRequestStore(rootDir).summarizeForCurrentPrompt().catch(() => "No protocol requests.")
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
    capabilitySummary: identity.kind === "lead" ? formatCapabilityRegistryForLead([
      { listCapabilityProfiles: listSubagentCapabilityProfiles },
      { listCapabilityProfiles: () => [getTeamCapabilityProfile()] },
      { listCapabilityProfiles: listWorkflowProfiles },
    ]) : undefined,
  };
}
