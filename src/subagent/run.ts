import { runAgentTurn } from "../agent/runTurn.js";
import { MemorySessionStore } from "../agent/sessionStore.js";
import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
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
}

export interface RunSubagentTaskResult {
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
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(options.cwd);
  const toolRegistry = options.createToolRegistry(mode, {
    onlyNames: profile.toolNames,
    excludeNames: ["task"],
  });
  const reporter = new SubagentProgressReporter(profile.type, options.description, options.callbacks);
  reporter.start();

  try {
    const result = await runAgentTurn({
      input: buildSubagentAssignment(options.description, options.prompt, profile),
      cwd: options.cwd,
      config: subagentConfig,
      session,
      sessionStore,
      toolRegistry,
      callbacks: reporter.createCallbacks(),
      identity: {
        kind: "subagent",
        name: buildSubagentName(profile.type, options.description),
        role: profile.type,
      },
    });

    reporter.finish();

    return {
      content: readLatestAssistantText(result.session.messages),
      metadata: buildSubagentMetadata(result, profile.type),
    };
  } catch (error) {
    reporter.fail(error);
    throw error;
  }
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
