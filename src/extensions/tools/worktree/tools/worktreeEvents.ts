import { clampNumber, parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { readWorktreeState } from "../state.js";

export const worktreeEventsTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "worktree_events",
      description: "Read recent worktree lifecycle events.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const limit = clampNumber(args.limit, 1, 200, 20);
    const state = await readWorktreeState(context.projectContext.stateRootDir);
    return jsonResult({
      ok: true,
      events: state.events.slice(-limit),
    });
  },
};
