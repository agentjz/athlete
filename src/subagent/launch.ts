import { spawnExecutionWorker as defaultSpawnExecutionWorker } from "../execution/launch.js";
import { ExecutionStore } from "../execution/store.js";
import type { ExecutionRecord, ExecutionWorktreePolicy } from "../execution/types.js";
import type { RuntimeConfig } from "../types.js";
import { buildSubagentAssignment, getSubagentProfile, resolveSubagentMode } from "./profiles.js";

type SpawnExecutionWorker = typeof defaultSpawnExecutionWorker;

export interface LaunchSubagentWorkerExecutionOptions {
  rootDir: string;
  cwd: string;
  config: RuntimeConfig;
  description: string;
  prompt: string;
  agentType: string;
  requestedBy?: string;
  taskId?: number;
  objectiveKey?: string;
  objectiveText?: string;
  actorName?: string;
  worktreePolicy?: ExecutionWorktreePolicy;
}

export interface LaunchSubagentWorkerExecutionDependencies {
  spawnExecutionWorker?: SpawnExecutionWorker;
}

export interface LaunchSubagentWorkerExecutionResult {
  execution: ExecutionRecord;
  pid: number;
}

export async function launchSubagentWorkerExecution(
  options: LaunchSubagentWorkerExecutionOptions,
  deps: LaunchSubagentWorkerExecutionDependencies = {},
): Promise<LaunchSubagentWorkerExecutionResult> {
  const profile = getSubagentProfile(options.agentType);
  resolveSubagentMode(profile, options.config.mode);

  const executionStore = new ExecutionStore(options.rootDir);
  const execution = await executionStore.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: options.requestedBy ?? "lead",
    actorName: options.actorName ?? buildSubagentName(profile.type, options.description),
    actorRole: profile.type,
    taskId: options.taskId,
    objectiveKey: options.objectiveKey,
    objectiveText: options.objectiveText,
    cwd: options.cwd,
    prompt: buildSubagentAssignment(options.description, options.prompt, profile),
    worktreePolicy: options.worktreePolicy ?? "none",
  });
  const spawnExecutionWorker = deps.spawnExecutionWorker ?? defaultSpawnExecutionWorker;
  const pid = spawnExecutionWorker({
    rootDir: options.rootDir,
    config: options.config,
    executionId: execution.id,
    actorName: execution.actorName,
  });
  const started = await executionStore.start(execution.id, {
    pid,
  });

  return {
    execution: started,
    pid,
  };
}

function buildSubagentName(agentType: string, description: string): string {
  const slug = description
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return `${agentType}-${slug || "task"}`;
}
