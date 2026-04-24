import { reconcileTeamState } from "../../team/reconcile.js";
import { TaskStore } from "../../tasks/store.js";
import { okResult } from "../shared.js";
import type { RegisteredTool } from "../types.js";

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
    const tasks = await store.list();
    return okResult(
      JSON.stringify(
        {
          ok: true,
          tasks,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
