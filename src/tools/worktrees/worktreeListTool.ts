import { WorktreeStore } from "../../worktrees/store.js";
import { okResult } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_list",
      description: "List isolated git worktrees tracked for this project.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const store = new WorktreeStore(context.projectContext.stateRootDir);
    const worktrees = await store.list();
    return okResult(
      JSON.stringify(
        {
          ok: true,
          worktrees,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
