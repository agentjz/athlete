import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeRemoveTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_remove",
      description: "Remove an isolated git worktree and optionally complete its bound task.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Worktree name.",
          },
          force: {
            type: "boolean",
            description: "Force removal even with uncommitted changes.",
          },
          complete_task: {
            type: "boolean",
            description: "Also mark the bound task completed.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new WorktreeStore(context.projectContext.stateRootDir);
    const worktree = await store.remove(readString(args.name, "name"), {
      force: readBoolean(args.force, false),
      completeTask: readBoolean(args.complete_task, false),
    });
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
