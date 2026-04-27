import { reconcileTeamState } from "../../../team/reconcile.js";
import { TaskStore } from "../../../../tasks/store.js";
import { okResult } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";

export const taskListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task_list",
      description: "List all persistent tasks in the project task board.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    await reconcileTeamState(context.projectContext.stateRootDir).catch(() => null);
    const store = new TaskStore(context.projectContext.stateRootDir);
    const allTasks = await store.list();
    const tasks = context.currentObjective
      ? allTasks.filter((task) => task.description.includes(`"key": "${context.currentObjective?.key}"`))
      : allTasks;
    const carryoverTaskCount = allTasks.length - tasks.length;
    return okResult(
      JSON.stringify(
        {
          ok: true,
          tasks,
          carryoverTaskCount,
          preview: await store.summarize({
            objectiveKey: context.currentObjective?.key,
            includeCarryoverCount: Boolean(context.currentObjective),
          }),
        },
        null,
        2,
      ),
    );
  },
};
