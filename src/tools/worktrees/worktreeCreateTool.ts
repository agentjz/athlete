import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_create",
      description: "Create an isolated git worktree, optionally binding it to a task.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Worktree name.",
          },
          task_id: {
            type: "number",
            description: "Optional task id to bind.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name");
    const taskId = readOptionalNumber(args.task_id);
    const store = new WorktreeStore(context.projectContext.stateRootDir);
    const worktree = await store.create(name, taskId);
    return okResult(
      JSON.stringify(
        {
          ok: true,
          worktree,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
