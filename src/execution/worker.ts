import process from "node:process";

import { runManagedAgentTurn } from "../agent/turn.js";
import { runAgentTurn } from "../agent/runTurn.js";
import { SessionStore } from "../agent/session.js";
import { isSessionNotFoundError } from "../agent/session/errors.js";
import { enterCrashContext, installCrashRecorder } from "../observability/crashRecorder.js";
import { recordObservabilityEvent } from "../observability/writer.js";
import { getSubagentProfile, resolveSubagentMode } from "../subagent/profiles.js";
import { TeamStore } from "../team/store.js";
import { createToolRegistry } from "../tools/index.js";
import type { RuntimeConfig } from "../types.js";
import { runCommandWithPolicy } from "../utils/commandRunner.js";
import { truncateText } from "../utils/fs.js";
import { closeExecution } from "./closeout.js";
import { ExecutionStore } from "./store.js";
import { prepareExecutionTaskContext } from "./taskBinding.js";
import type { ExecutionRecord } from "./types.js";

export async function runExecutionWorker(input: {
  rootDir: string;
  config: RuntimeConfig;
  executionId: string;
}): Promise<void> {
  installCrashRecorder({
    rootDir: input.rootDir,
    host: "worker",
    executionId: input.executionId,
  });
  const releaseCrashContext = enterCrashContext({
    host: "worker",
    executionId: input.executionId,
  });
  const execution = await new ExecutionStore(input.rootDir).load(input.executionId);
  try {
    if (execution.lane === "command") {
      await runCommandExecution(input.rootDir, execution);
      return;
    }

    await runAgentExecution(input.rootDir, input.config, execution);
  } finally {
    releaseCrashContext();
  }
}

async function runAgentExecution(rootDir: string, config: RuntimeConfig, execution: ExecutionRecord): Promise<void> {
  const prepared = await prepareExecutionTaskContext({
    rootDir,
    execution,
  });
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await loadAgentSession(rootDir, execution, sessionStore, prepared.cwd);
  const teammateIdentity = execution.profile === "teammate"
    ? {
        kind: "teammate" as const,
        name: execution.actorName,
        role: execution.actorRole ?? "implementer",
        teamName: (await new TeamStore(rootDir).loadConfig()).teamName,
      }
    : null;
  const store = new ExecutionStore(rootDir);
  await store.start(execution.id, {
    pid: process.pid,
    sessionId: session.id,
    cwd: prepared.cwd,
    worktreeName: prepared.worktree?.name,
  });
  await recordExecutionStarted(rootDir, execution, {
    sessionId: session.id,
    cwd: prepared.cwd,
    worktreeName: prepared.worktree?.name,
  });

  try {
    const inputText = buildAgentExecutionInput(execution, prepared);
    const result = execution.profile === "subagent"
      ? await runSubagentExecutionSlice({
          input: inputText,
          cwd: prepared.cwd,
          config,
          session,
          sessionStore,
          identity: {
            kind: "subagent",
            name: execution.actorName,
            role: execution.actorRole,
          },
          subagentType: execution.actorRole ?? "explore",
        })
      : await runManagedAgentTurn({
          input: inputText,
          cwd: prepared.cwd,
          config,
          session,
          sessionStore,
          identity: teammateIdentity ?? {
            kind: "teammate",
            name: execution.actorName,
            role: execution.actorRole ?? "implementer",
            teamName: "default",
          },
        });

    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: result.paused ? "paused" : "completed",
      summary: result.paused
        ? result.pauseReason || `${execution.profile} execution paused`
        : `${execution.profile} execution completed`,
      resultText: readLatestAssistantText(result.session.messages),
      pauseReason: result.pauseReason,
    });
  } catch (error) {
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: "failed",
      summary: `${execution.profile} execution failed`,
      output: String((error as { message?: unknown }).message ?? error),
    }).catch(() => null);
    throw error;
  }
}

async function runCommandExecution(rootDir: string, execution: ExecutionRecord): Promise<void> {
  const store = new ExecutionStore(rootDir);
  await store.start(execution.id, {
    pid: process.pid,
  });
  await recordExecutionStarted(rootDir, execution);

  try {
    const result = await runCommandWithPolicy({
      command: execution.command || "",
      cwd: execution.cwd,
      timeoutMs: execution.timeoutMs ?? 120_000,
      stallTimeoutMs: execution.stallTimeoutMs ?? execution.timeoutMs ?? 120_000,
      maxRetries: 0,
      retryBackoffMs: 0,
      canRetry: false,
    });
    const status = result.stalled || result.timedOut
      ? "failed"
      : result.exitCode === 0
        ? "completed"
        : "failed";
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status,
      summary: status === "completed" ? "background execution completed" : "background execution failed",
      output: truncateText(result.output ?? "", 12_000),
      exitCode: typeof result.exitCode === "number" ? result.exitCode : undefined,
      statusDetail: result.stalled || result.timedOut ? "timed_out" : undefined,
    });
  } catch (error) {
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: "failed",
      summary: "background execution failed",
      output: truncateText(readProcessOutput(error), 12_000),
      exitCode: readExitCode(error),
      statusDetail: isTimedOutError(error) ? "timed_out" : undefined,
    }).catch(() => null);
    throw error;
  }
}

async function loadAgentSession(
  rootDir: string,
  execution: ExecutionRecord,
  sessionStore: SessionStore,
  cwd: string,
) {
  const existingSessionId =
    execution.sessionId ||
    (execution.profile === "teammate"
      ? (await new TeamStore(rootDir).findMember(execution.actorName))?.sessionId
      : undefined);
  if (existingSessionId) {
    try {
      return await sessionStore.load(existingSessionId);
    } catch (error) {
      if (!isSessionNotFoundError(error)) {
        throw error;
      }
    }
  }

  const session = await sessionStore.create(cwd);
  const saved = await sessionStore.save(session);
  if (execution.profile === "teammate") {
    await new TeamStore(rootDir).upsertMember(
      execution.actorName,
      execution.actorRole ?? "implementer",
      "working",
      {
        sessionId: saved.id,
        pid: process.pid,
      },
    );
  }
  return saved;
}

function buildAgentExecutionInput(
  execution: ExecutionRecord,
  prepared: Awaited<ReturnType<typeof prepareExecutionTaskContext>>,
): string {
  const sections = [execution.prompt || ""];
  if (prepared.task) {
    sections.unshift(`Task #${prepared.task.id}: ${prepared.task.subject}\n${prepared.task.description}`.trim());
  }
  if (prepared.worktree) {
    sections.push(
      `<worktree name="${prepared.worktree.name}" path="${prepared.worktree.path}" branch="${prepared.worktree.branch}" />`,
    );
  }

  return sections.filter(Boolean).join("\n\n");
}

async function runSubagentExecutionSlice(input: {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: Awaited<ReturnType<SessionStore["create"]>>;
  sessionStore: SessionStore;
  identity: {
    kind: "subagent";
    name: string;
    role?: string;
  };
  subagentType: string;
}) {
  const profile = getSubagentProfile(input.subagentType);
  const mode = resolveSubagentMode(profile, input.config.mode);
  const subagentConfig: RuntimeConfig = {
    ...input.config,
    mode,
  };

  return runAgentTurn({
    input: input.input,
    cwd: input.cwd,
    config: subagentConfig,
    session: input.session,
    sessionStore: input.sessionStore,
    toolRegistry: createToolRegistry(mode, {
      onlyNames: profile.toolNames,
      excludeNames: ["task"],
    }),
    identity: input.identity,
  });
}

function readLatestAssistantText(
  messages: Array<{ role?: string; content?: string | null; reasoningContent?: string | null }>,
): string {
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

  return "(execution returned no text)";
}

function readExitCode(error: unknown): number | undefined {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : undefined;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Background execution failed.";
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

async function recordExecutionStarted(
  rootDir: string,
  execution: ExecutionRecord,
  overrides: {
    sessionId?: string;
    cwd?: string;
    worktreeName?: string;
  } = {},
): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "execution.lifecycle",
    status: "started",
    executionId: execution.id,
    identityKind: execution.profile,
    identityName: execution.actorName,
    details: {
      lane: execution.lane,
      profile: execution.profile,
      actorName: execution.actorName,
      actorRole: execution.actorRole,
      taskId: execution.taskId,
      worktreeName: overrides.worktreeName ?? execution.worktreeName,
      sessionId: overrides.sessionId ?? execution.sessionId,
      cwd: overrides.cwd ?? execution.cwd,
    },
  });
}
