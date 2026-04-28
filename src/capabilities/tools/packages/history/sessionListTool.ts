import { okResult, parseArgs } from "../../core/shared.js";
import {
  clampLimit,
  createSessionStore,
  summarizeSession,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const sessionListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "session_list",
      description: "List persisted session snapshots as a read-only history index. This does not choose relevance or inject history into the current objective.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of recent sessions to list.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const limit = clampLimit(args.limit, 20);
    const sessions = await createSessionStore(context.config).list(limit);
    return okResult(
      JSON.stringify(
        {
          ok: true,
          sessions: sessions.map(summarizeSession),
        },
        null,
        2,
      ),
    );
  },
};
