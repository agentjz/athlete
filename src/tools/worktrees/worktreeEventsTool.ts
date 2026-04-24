import { WorktreeStore } from "../../worktrees/store.js";
import { clampNumber, okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const worktreeEventsTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_events",
      description: "Read recent worktree lifecycle events.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional number of recent events.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new WorktreeStore(context.projectContext.stateRootDir);
    const limit = clampNumber(args.limit, 1, 200, 20);
    const events = await store.readEvents(limit);
    return okResult(
      JSON.stringify(
        {
          ok: true,
          events,
          preview:
            events.length > 0
              ? events
                  .map((event) => {
                    const worktree = event.worktree?.name ? ` ${event.worktree.name}` : "";
                    const task = typeof event.task?.id === "number" ? ` task=${event.task.id}` : "";
                    return `${event.event}${worktree}${task}`;
                  })
                  .join("\n")
              : "No worktree events.",
        },
        null,
        2,
      ),
    );
  },
};
