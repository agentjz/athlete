import { spawnExecutionWorker } from "../../../../execution/launch.js";
import { ExecutionStore } from "../../../../execution/store.js";
import { reconcileTeamState } from "../../../team/reconcile.js";
import { TeamStore } from "../../../team/store.js";
import { buildTeammateAssignment } from "../../../team/profiles.js";
import { TaskStore } from "../../../../tasks/store.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import type { ToolExecutionMetadata } from "../../../../types.js";

export const spawnTeammateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spawn_teammate",
      description: "Spawn an autonomous background teammate process.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Stable teammate name.",
          },
          role: {
            type: "string",
            description: "Teammate role description.",
          },
          objective: {
            type: "string",
            description: "AssignmentContract objective for the teammate.",
          },
          scope: {
            type: "string",
            description: "AssignmentContract scope boundary.",
          },
          expected_output: {
            type: "string",
            description: "AssignmentContract expected output.",
          },
          task_id: {
            type: "number",
            description: "Optional task id to reserve for this teammate before it starts running.",
          },
        },
        required: ["name", "role", "objective", "scope", "expected_output"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    if (context.identity.kind !== "lead") {
      throw new Error("Only the lead can spawn_teammate.");
    }

    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name");
    const role = readString(args.role, "role");
    const objective = readString(args.objective, "objective");
    const scope = readString(args.scope, "scope");
    const expectedOutput = readString(args.expected_output, "expected_output");
    const taskId = readOptionalNumber(args.task_id);
    await reconcileTeamState(context.projectContext.stateRootDir).catch(() => null);
    const teamStore = new TeamStore(context.projectContext.stateRootDir);
    const taskStore = new TaskStore(context.projectContext.stateRootDir);
    const existing = await teamStore.findMember(name);
    if (existing && existing.status === "working") {
      throw new Error(`Teammate '${name}' is already working.`);
    }

    let previousAssignee: string | undefined;
    let reservedTaskId: number | undefined;
    if (taskId) {
      previousAssignee = (await taskStore.load(taskId)).assignee;
      await taskStore.assign(taskId, name);
      reservedTaskId = taskId;
    }

    let pid: number;
    let executionId = "";
    try {
      const executionStore = new ExecutionStore(context.projectContext.stateRootDir);
      const execution = await executionStore.create({
        lane: "agent",
        profile: "teammate",
        launch: "worker",
        requestedBy: context.identity.name,
        actorName: name,
        actorRole: role,
        taskId: reservedTaskId,
        objectiveKey: context.currentObjective?.key,
        objectiveText: context.currentObjective?.text,
        cwd: context.cwd,
        prompt: buildTeammateAssignment({ name, role, objective, scope, expectedOutput }),
        worktreePolicy: reservedTaskId ? "task" : "none",
      });
      executionId = execution.id;
      pid = spawnExecutionWorker({
        rootDir: context.projectContext.stateRootDir,
        config: context.config,
        executionId,
        actorName: name,
      });
      await executionStore.start(executionId, { pid });
    } catch (error) {
      if (taskId) {
        await taskStore.update(taskId, {
          assignee: previousAssignee ?? "",
        }).catch(() => null);
      }
      throw error;
    }

    const member = await teamStore.upsertMember(name, role, "working", {
      pid,
      sessionId: existing?.sessionId,
    });
    context.callbacks?.onDispatch?.({
      profile: "teammate",
      actorName: name,
      executionId,
      taskId: reservedTaskId,
      pid,
      summary: `role=${role}`,
    });
    const collaboration = {
      action: "spawn" as const,
      actor: name,
      executionId,
      taskId: reservedTaskId,
      yieldLeadUntilCloseout: true,
    };
    const metadata: ToolExecutionMetadata = {
      collaboration,
    };

    return okResult(
      JSON.stringify(
        {
          ok: true,
          member,
          executionId,
          protocol: {
            assignment: "deadmouse.assignment",
            closeout: "deadmouse.closeout",
            wakeSignal: "deadmouse.wake-signal",
          },
          reservedTaskId,
          collaboration,
          preview: `Spawned '${name}' (${role}) pid=${pid}${reservedTaskId ? ` task=${reservedTaskId}` : ""}`,
        },
        null,
        2,
      ),
      metadata,
    );
  },
};
