import { reconcileTeamState } from "../../team/reconcile.js";
import { TaskStore } from "../../tasks/store.js";
import { okResult, parseArgs, readOptionalNumber } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const taskGetTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task_get",
      description: "Get a task by id from the persistent project task board.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "Task id.",
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    await reconcileTeamState(context.projectContext.stateRootDir).catch(() => null);
    const args = parseArgs(rawArgs);
    const taskId = readOptionalNumber(args.task_id);
    if (!taskId) {
      throw new Error('Tool argument "task_id" must be a positive number.');
    }

    const store = new TaskStore(context.projectContext.stateRootDir);
    const task = await store.load(taskId);
    return okResult(
      JSON.stringify(
        {
          ok: true,
          task,
        },
        null,
        2,
      ),
    );
  },
};
