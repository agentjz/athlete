import fs from "node:fs/promises";
import path from "node:path";

import { runManagedAgentTurn } from "../../agent/turn.js";
import { SessionStore } from "../../agent/session.js";
import { createToolRegistry } from "../tools/index.js";
import type { RuntimeConfig, StoredMessage } from "../../types.js";
import { closeExecution } from "../../execution/closeout.js";
import { appendForegroundStreamEvent, readForegroundStreamText } from "../../execution/foregroundStream.js";
import type { ExecutionRecord } from "../../execution/types.js";
import { ExecutionStore } from "../../execution/store.js";
import { createExecutionForegroundCallbacks } from "../../execution/foregroundCallbacks.js";
import { createDreamingMirrorWorld } from "./mirrorWorld.js";
import { getDreamingDir, readDreamingState, writeDreamingState } from "./state.js";
import {
  assertRealWorldGitUnchanged,
  createDreamingBoundaryCallbacks,
  createDreamingWriteBoundary,
  snapshotRealWorldGitStatus,
} from "./writeBoundary.js";

export async function runDreamingExecution(rootDir: string, config: RuntimeConfig, execution: ExecutionRecord): Promise<void> {
  const store = new ExecutionStore(rootDir);
  await appendDreaming(rootDir, execution.id, "Dreaming execution starting.");
  const state = await readDreamingState(rootDir, execution.id);
  await writeDreamingState(rootDir, {
    ...state,
    status: "running",
  });

  try {
    const realWorldBaseline = await snapshotRealWorldGitStatus(rootDir);
    const mirrorWorld = await createDreamingMirrorWorld({
      rootDir,
      executionId: execution.id,
    });
    await store.save({
      ...execution,
      cwd: mirrorWorld.path,
      worktreeName: mirrorWorld.name,
    });
    await writeDreamingState(rootDir, {
      ...state,
      status: "running",
      mirrorWorld,
    });
    await appendDreaming(rootDir, execution.id, `Mirror World created at ${mirrorWorld.path}.`);
    await appendDreaming(rootDir, execution.id, "Real World remains unchanged unless the user approves a later merge.");

    const sessionStore = new SessionStore(config.paths.sessionsDir);
    const session = await sessionStore.save(await sessionStore.create(mirrorWorld.path));
    const inputText = buildDreamingAgentInput({
      execution,
      mirrorWorldPath: mirrorWorld.path,
      realWorldPath: mirrorWorld.realWorldPath,
    });
    await appendDreaming(rootDir, execution.id, "Dreaming agent entering mirror-world loop.");
    const boundary = createDreamingWriteBoundary({
      realWorldPath: mirrorWorld.realWorldPath,
      mirrorWorldPath: mirrorWorld.path,
      realWorldBaseline,
    });
    const result = await runManagedAgentTurn({
      input: inputText,
      cwd: mirrorWorld.path,
      config,
      session,
      sessionStore,
      toolRegistry: createToolRegistry({
        excludeNames: [
          "background_run",
          "background_terminate",
          "broadcast",
          "claim_task",
          "coordination_policy",
          "dreaming_start",
          "plan_approval",
          "send_message",
          "shutdown_request",
          "shutdown_response",
          "spawn_teammate",
          "task",
          "task_create",
          "task_update",
          "todo_write",
          "undo_last_change",
          "worktree_create",
          "worktree_keep",
          "worktree_remove",
        ],
      }),
      identity: {
        kind: "teammate",
        name: "Dreaming",
        role: "mirror-world self-improvement ecology",
        teamName: "dreaming",
      },
      callbacks: createDreamingBoundaryCallbacks({
        boundary,
        base: createDreamingCallbacks(rootDir, execution.id),
      }),
    });
    await assertRealWorldGitUnchanged(rootDir, realWorldBaseline);
    const mergeProposalPath = await writeMergeProposal({
      rootDir,
      execution,
      mirrorWorldPath: mirrorWorld.path,
      resultText: readLatestAssistantText(result.session.messages),
      paused: result.paused === true,
      pauseReason: result.pauseReason,
    });
    await writeDreamingState(rootDir, {
      ...state,
      status: result.paused ? "paused" : "completed",
      mirrorWorld,
      mergeProposalPath,
    });
    await appendDreaming(rootDir, execution.id, `Merge proposal written to ${mergeProposalPath}.`);
    const streamText = await readForegroundStreamText(rootDir, execution.id);
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: result.paused ? "paused" : "completed",
      summary: result.paused ? result.pauseReason || "Dreaming paused for Lead review" : "Dreaming completed in Mirror World",
      resultText: [
        readLatestAssistantText(result.session.messages),
        "",
        `Mirror World: ${mirrorWorld.path}`,
        `Merge proposal: ${mergeProposalPath}`,
      ].join("\n").trim(),
      output: streamText,
      pauseReason: result.pauseReason,
    });
  } catch (error) {
    await appendDreaming(rootDir, execution.id, `Dreaming failed: ${String((error as { message?: unknown }).message ?? error)}`, "error").catch(() => null);
    const previous = await readDreamingState(rootDir, execution.id).catch(() => state);
    await writeDreamingState(rootDir, {
      ...previous,
      status: "failed",
    }).catch(() => null);
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: "failed",
      summary: "Dreaming failed",
      output: String((error as { message?: unknown }).message ?? error),
    }).catch(() => null);
    throw error;
  }
}

function createDreamingCallbacks(rootDir: string, executionId: string) {
  return createExecutionForegroundCallbacks({
    rootDir,
    executionId,
    label: "dreaming",
  });
}

async function appendDreaming(
  rootDir: string,
  executionId: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
  data?: Record<string, unknown>,
): Promise<void> {
  await appendForegroundStreamEvent({
    rootDir,
    executionId,
    label: "dreaming",
    level,
    message,
    data,
  });
}

function buildDreamingAgentInput(input: {
  execution: ExecutionRecord;
  mirrorWorldPath: string;
  realWorldPath: string;
}): string {
  return [
    input.execution.prompt ?? "Run Dreaming in Mirror World.",
    "",
    "<world-boundary>",
    `Real World: ${input.realWorldPath}`,
    `Mirror World: ${input.mirrorWorldPath}`,
    "Read broadly when needed. Write project changes only inside Mirror World.",
    "Do not merge into Real World. Produce evidence and a merge proposal.",
    "</world-boundary>",
    "",
    "<dreaming-loop>",
    "1. Inspect the objective, specs, tests, recent traces, and current architecture.",
    "2. Identify one or more concrete improvement candidates.",
    "3. Implement only in Mirror World.",
    "4. Run relevant verification available in Mirror World.",
    "5. Record evidence, residual risks, and a merge proposal.",
    "6. Return a concise closeout for Lead review.",
    "</dreaming-loop>",
  ].join("\n");
}

async function writeMergeProposal(input: {
  rootDir: string;
  execution: ExecutionRecord;
  mirrorWorldPath: string;
  resultText: string;
  paused: boolean;
  pauseReason?: string;
}): Promise<string> {
  const dir = getDreamingDir(input.rootDir, input.execution.id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "merge-proposal.md");
  await fs.writeFile(file, [
    "# Dreaming Merge Proposal",
    "",
    `Execution: ${input.execution.id}`,
    `Status: ${input.paused ? "paused" : "completed"}`,
    `Mirror World: ${input.mirrorWorldPath}`,
    `Real World: ${input.rootDir}`,
    "",
    "## Boundary",
    "",
    "Dreaming modified only Mirror World. Real World requires explicit user approval before merge.",
    "",
    "## Closeout",
    "",
    input.resultText || "(Dreaming returned no visible closeout.)",
    "",
    input.pauseReason ? `Pause reason: ${input.pauseReason}` : "",
  ].filter(Boolean).join("\n"), "utf8");
  return file;
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
  return "(Dreaming returned no visible closeout.)";
}
