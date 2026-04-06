import { spawnTeammateProcess } from "../../team/spawn.js";
import { reconcileTeamState } from "../../team/reconcile.js";
import { TeamStore } from "../../team/store.js";
import { TaskStore } from "../../tasks/store.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

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
    try {
      pid = spawnTeammateProcess({
        rootDir: context.projectContext.stateRootDir,
        config: context.config,
        name,
        role,
        prompt,
      });
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

    return okResult(
      JSON.stringify(
        {
          ok: true,
          member,
          reservedTaskId,
          preview: `Spawned '${name}' (${role}) pid=${pid}${reservedTaskId ? ` task=${reservedTaskId}` : ""}`,
        },
        null,
        2,
      ),
    );
  },
};
