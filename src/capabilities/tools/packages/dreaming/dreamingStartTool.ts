import { spawnExecutionWorker } from "../../../../execution/launch.js";
import { ExecutionStore } from "../../../../execution/store.js";
import { createExecutionFromAssignment } from "../../../../execution/createFromAssignment.js";
import { createAssignmentContract } from "../../../../protocol/assignment.js";
import { getDreamingCapabilityPackage } from "../../../dreaming/capabilityAdapter.js";
import { createForegroundStreamRef } from "../../../../execution/foregroundStream.js";
import { DREAMING_STATE_PROTOCOL, writeDreamingState } from "../../../dreaming/state.js";
import { okResult, parseArgs, readString, clampNumber } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import type { ToolExecutionMetadata } from "../../../../types.js";
import { createTimestampedDreamingRoundId } from "../../../dreaming/ids.js";

export const dreamingStartTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "dreaming_start",
      description:
        "Lead-only: start Dreaming, an autonomous mirror-world self-improvement execution. Dreaming may freely modify the mirror world, but the real world remains unchanged until a later user-approved merge.",
      parameters: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            description: "AssignmentContract objective for Dreaming.",
          },
          scope: {
            type: "string",
            description: "Real World / Mirror World boundary and allowed improvement scope.",
          },
          expected_output: {
            type: "string",
            description: "Expected closeout, artifacts, and merge proposal.",
          },
          max_runtime_ms: {
            type: "number",
            description: "Optional maximum runtime for this Dreaming execution.",
          },
          max_idle_ms: {
            type: "number",
            description: "Optional maximum idle time before returning to Lead review.",
          },
        },
        required: ["objective", "scope", "expected_output"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    if (context.identity.kind !== "lead") {
      throw new Error("Only the lead can start Dreaming.");
    }

    const args = parseArgs(rawArgs);
    const objective = readString(args.objective, "objective");
    const scope = readString(args.scope, "scope");
    const expectedOutput = readString(args.expected_output, "expected_output");
    const timeoutMs = clampNumber(args.max_runtime_ms, 1_000, 900_000, 900_000);
    const stallTimeoutMs = clampNumber(args.max_idle_ms, 1_000, 300_000, 300_000);
    const capability = getDreamingCapabilityPackage();
    const executionId = createTimestampedDreamingRoundId(1);
    const assignment = createAssignmentContract({
      capabilityId: capability.packageId,
      objective,
      scope,
      expectedOutput,
      createdBy: context.identity.name,
    });
    const execution = await createExecutionFromAssignment({
      rootDir: context.projectContext.stateRootDir,
      id: executionId,
      capability,
      assignment,
      lane: "agent",
      profile: "dreaming",
      launch: "worker",
      requestedBy: context.identity.name,
      actorName: "Dreaming",
      actorRole: "mirror-world self-improvement ecology",
      objectiveKey: context.currentObjective?.key,
      objectiveText: context.currentObjective?.text,
      cwd: context.projectContext.rootDir,
      prompt: buildDreamingPrompt({ objective, scope, expectedOutput }),
      worktreePolicy: "none",
      timeoutMs,
      stallTimeoutMs,
    });
    const foreground = await createForegroundStreamRef({
      rootDir: context.projectContext.stateRootDir,
      executionId: execution.id,
      label: "dreaming",
    });
    await writeDreamingState(context.projectContext.stateRootDir, {
      protocol: DREAMING_STATE_PROTOCOL,
      executionId: execution.id,
      objective,
      scope,
      expectedOutput,
      foregroundStreamPath: foreground.path,
      status: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const pid = spawnExecutionWorker({
      rootDir: context.projectContext.stateRootDir,
      config: context.config,
      executionId: execution.id,
      actorName: "Dreaming",
    });
    await new ExecutionStore(context.projectContext.stateRootDir).start(execution.id, { pid });
    context.callbacks?.onDispatch?.({
      profile: "dreaming",
      actorName: "Dreaming",
      executionId: execution.id,
      pid,
      summary: "foreground stream will show the mirror-world execution",
    });

    const metadata: ToolExecutionMetadata = {
      collaboration: {
        action: "spawn",
        actor: "Dreaming",
        executionId: execution.id,
        yieldLeadUntilCloseout: true,
      },
    };

    return okResult(JSON.stringify({
      ok: true,
      status: "launched",
      executionId: execution.id,
      pid,
      realWorld: context.projectContext.rootDir,
      foregroundStream: foreground,
      protocol: {
        assignment: "kitty.assignment",
        mirrorWorld: "kitty.mirror-world",
        foregroundStream: foreground.protocol,
        closeout: "kitty.closeout",
        wakeSignal: "kitty.wake-signal",
      },
      preview: `Dreaming started execution '${execution.id}'. Real World remains unchanged; Mirror World will be created by the worker.`,
    }, null, 2), metadata);
  },
};

function buildDreamingPrompt(input: {
  objective: string;
  scope: string;
  expectedOutput: string;
}): string {
  return [
    "You are Dreaming, Kitty's autonomous mirror-world self-improvement ecology.",
    "",
    "Core boundary:",
    "- Real World is the source repository. Do not modify it.",
    "- Mirror World is your execution workspace. You may modify Mirror World freely.",
    "- Produce a merge proposal instead of merging into Real World.",
    "- Lead will review your evidence in Mirror World after closeout.",
    "",
    `Objective: ${input.objective}`,
    `Scope: ${input.scope}`,
    `Expected output: ${input.expectedOutput}`,
  ].join("\n");
}
