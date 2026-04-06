import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeGetTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_get",
      description: "Get details for a named isolated git worktree.",
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
    const worktree = await store.get(readString(args.name, "name"));
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
