import { listAgentTraceSessions } from "../../../../trace/store.js";
import { okResult, parseArgs } from "../../core/shared.js";
import { clampLimit } from "../history/historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const agentTraceListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "agent_trace_list",
      description: "List persisted agent trace dossiers. This is explicit forensic lookup, not automatic prompt recall.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of newest trace sessions to return.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const limit = clampLimit(args.limit, 40);
    const sessions = await listAgentTraceSessions(context.projectContext.stateRootDir);
    return okResult(JSON.stringify({
      ok: true,
      traces: sessions.slice(0, limit),
      truncated: sessions.length > limit,
    }, null, 2));
  },
};
