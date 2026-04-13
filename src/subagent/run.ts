import { runAgentTurn } from "../agent/runTurn.js";
import { SessionStore } from "../agent/session.js";
import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import { loadProjectContext } from "../context/projectContext.js";
import { closeExecution } from "../execution/closeout.js";
import { ExecutionStore } from "../execution/store.js";
import { prepareExecutionTaskContext } from "../execution/taskBinding.js";
import type { ToolRegistryFactory } from "../tools/types.js";
import type { RuntimeConfig, StoredMessage, ToolExecutionMetadata } from "../types.js";
import { SubagentProgressReporter } from "./progress.js";
import { buildSubagentAssignment, getSubagentProfile, resolveSubagentMode } from "./profiles.js";

export interface RunSubagentTaskOptions {
  description: string;
  prompt: string;
  agentType: string;
  cwd: string;
  config: RuntimeConfig;
  createToolRegistry: ToolRegistryFactory;
  callbacks?: AgentCallbacks;
  taskId?: number;
  requestedBy?: string;
  worktreePolicy?: "none" | "task";
}

export interface RunSubagentTaskResult {
  executionId: string;
  content: string;
  metadata?: ToolExecutionMetadata;
}

export async function runSubagentTask(
  options: RunSubagentTaskOptions,
): Promise<RunSubagentTaskResult> {
  const profile = getSubagentProfile(options.agentType);
  const mode = resolveSubagentMode(profile, options.config.mode);
  const subagentConfig: RuntimeConfig = {
    ...options.config,
    mode,
  };
  const projectContext = await loadProjectContext(options.cwd);
  const executionStore = new ExecutionStore(projectContext.stateRootDir);
  const execution = await executionStore.create({
    lane: "agent",
    profile: "subagent",
    launch: "inline",
    requestedBy: options.requestedBy ?? "lead",
    actorName: buildSubagentName(profile.type, options.description),
    actorRole: profile.type,
    taskId: options.taskId,
    cwd: options.cwd,
    prompt: buildSubagentAssignment(options.description, options.prompt, profile),
    worktreePolicy: options.worktreePolicy ?? "none",
  });
  const prepared = await prepareExecutionTaskContext({
    rootDir: projectContext.stateRootDir,
    execution,
  });
  const sessionStore = new SessionStore(options.config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(prepared.cwd));
  await executionStore.start(execution.id, {
    sessionId: session.id,
    cwd: prepared.cwd,
    worktreeName: prepared.worktree?.name,
  });
  const toolRegistry = options.createToolRegistry(mode, {
    onlyNames: profile.toolNames,
    excludeNames: ["task"],
  });
  const reporter = new SubagentProgressReporter(profile.type, options.description, options.callbacks);
  reporter.start();

  try {
    const result = await runAgentTurn({
      input: buildSubagentInput(execution.prompt || options.prompt, prepared.worktree),
      cwd: prepared.cwd,
      config: subagentConfig,
      session,
      sessionStore,
      toolRegistry,
      callbacks: reporter.createCallbacks(),
      identity: {
        kind: "subagent",
        name: execution.actorName,
        role: profile.type,
      },
    });

    reporter.finish();
    await closeExecution({
      rootDir: projectContext.stateRootDir,
      executionId: execution.id,
      status: "completed",
      summary: "subagent execution completed",
      resultText: readLatestAssistantText(result.session.messages),
      notifyRequester: false,
    });

    return {
      executionId: execution.id,
      content: readLatestAssistantText(result.session.messages),
      metadata: buildSubagentMetadata(result, profile.type),
    };
  } catch (error) {
    reporter.fail(error);
    await closeExecution({
      rootDir: projectContext.stateRootDir,
      executionId: execution.id,
      status: "failed",
      summary: "subagent execution failed",
      output: String((error as { message?: unknown }).message ?? error),
      notifyRequester: false,
    }).catch(() => null);
    throw error;
  }
}

function buildSubagentInput(
  assignment: string,
  worktree?: {
    name: string;
    path: string;
    branch: string;
  },
): string {
  if (!worktree) {
    return assignment;
  }

  return [
    assignment,
    `<worktree name="${worktree.name}" path="${worktree.path}" branch="${worktree.branch}" />`,
  ].join("\n\n");
}

function buildSubagentMetadata(
  result: RunTurnResult,
  agentType: string,
): ToolExecutionMetadata | undefined {
  const metadata: ToolExecutionMetadata = {};

  if (result.changedPaths.length > 0) {
    metadata.changedPaths = result.changedPaths;
  }

  if (result.verificationAttempted) {
    metadata.verification = {
      attempted: true,
      command: `subagent:${agentType}`,
      exitCode: 0,
      kind: "delegated",
    };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readLatestAssistantText(messages: StoredMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }

    const content = message.content?.trim();
    if (content) {
      return content;
    }

    const reasoning = message.reasoningContent?.trim();
    if (reasoning) {
      return reasoning;
    }
  }

  return "(subagent returned no text)";
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
