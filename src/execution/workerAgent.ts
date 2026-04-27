import process from "node:process";

import { runManagedAgentTurn } from "../agent/turn.js";
import { runAgentTurn } from "../agent/runTurn.js";
import { SessionStore } from "../agent/session.js";
import { isSessionNotFoundError } from "../agent/session/errors.js";
import type { AgentCallbacks } from "../agent/types.js";
import { getSubagentProfile } from "../subagent/profiles.js";
import { TeamStore } from "../team/store.js";
import { createToolRegistry } from "../tools/index.js";
import type { RuntimeConfig, StoredMessage } from "../types.js";
import { runWithinAgentExecutionBoundary } from "./agentBoundary.js";
import { closeExecution } from "./closeout.js";
import { ExecutionStore } from "./store.js";
import { prepareExecutionTaskContext } from "./taskBinding.js";
import { recordExecutionStarted } from "./workerObservability.js";
import type { ExecutionRecord } from "./types.js";

export async function runAgentExecution(rootDir: string, config: RuntimeConfig, execution: ExecutionRecord): Promise<void> {
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
    const boundaryResult = await runWithinAgentExecutionBoundary({
      boundary: execution.boundary,
      run: ({ abortSignal, callbacks }) => execution.profile === "subagent"
        ? runSubagentExecutionSlice({
            input: inputText,
            cwd: prepared.cwd,
            config,
            session,
            sessionStore,
            callbacks,
            abortSignal,
            identity: {
              kind: "subagent",
              name: execution.actorName,
              role: execution.actorRole,
            },
            subagentType: execution.actorRole ?? "explore",
          })
        : runManagedAgentTurn({
            input: inputText,
            cwd: prepared.cwd,
            config,
            session,
            sessionStore,
            callbacks,
            abortSignal,
            identity: teammateIdentity ?? {
              kind: "teammate",
              name: execution.actorName,
              role: execution.actorRole ?? "implementer",
              teamName: "default",
            },
          }),
    });
    if (boundaryResult.kind === "boundary") {
      await closeExecution({
        rootDir,
        executionId: execution.id,
        status: "paused",
        summary: boundaryResult.reason.message,
        output: JSON.stringify(boundaryResult.reason, null, 2),
        pauseReason: boundaryResult.reason.message,
        statusDetail: boundaryResult.reason.code,
      });
      return;
    }

    const result = boundaryResult.result;

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
  sections.push(
    [
      "<execution-boundary protocol=\"deadmouse.execution-boundary.v1\">",
      `Return control to lead review when this execution reaches ${execution.boundary.maxRuntimeMs}ms runtime or ${execution.boundary.maxIdleMs}ms idle boundary.`,
      "Do not claim the parent task is complete; hand back concrete status, evidence, blockers, and recommended next options.",
      "</execution-boundary>",
    ].join("\n"),
  );

  return sections.filter(Boolean).join("\n\n");
}

async function runSubagentExecutionSlice(input: {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: Awaited<ReturnType<SessionStore["create"]>>;
  sessionStore: SessionStore;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  identity: {
    kind: "subagent";
    name: string;
    role?: string;
  };
  subagentType: string;
}) {
  const profile = getSubagentProfile(input.subagentType);
  return runAgentTurn({
    input: input.input,
    cwd: input.cwd,
    config: input.config,
    session: input.session,
    sessionStore: input.sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: profile.toolNames,
      excludeNames: ["task"],
    }),
    callbacks: input.callbacks,
    abortSignal: input.abortSignal,
    identity: input.identity,
  });
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

  return "(execution returned no text)";
}
