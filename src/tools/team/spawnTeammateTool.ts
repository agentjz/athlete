import { spawnExecutionWorker } from "../../execution/launch.js";
import { ExecutionStore } from "../../execution/store.js";
import { reconcileTeamState } from "../../team/reconcile.js";
import { TeamStore } from "../../team/store.js";
import { TaskStore } from "../../tasks/store.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import type { ToolExecutionMetadata } from "../../types.js";

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
          prompt: {
            type: "string",
            description: "Initial teammate assignment.",
          },
          task_id: {
            type: "number",
            description: "Optional task id to reserve for this teammate before it starts running.",
          },
        },
        required: ["name", "role", "prompt"],
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
    const prompt = readString(args.prompt, "prompt");
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
        prompt,
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
