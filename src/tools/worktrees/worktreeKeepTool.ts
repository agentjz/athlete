import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeKeepTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_keep",
      description: "Mark a worktree as kept for later inspection.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Worktree name.",
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
    const worktree = await store.keep(readString(args.name, "name"));
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
