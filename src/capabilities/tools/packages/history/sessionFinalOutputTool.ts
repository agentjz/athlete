import { okResult, parseArgs } from "../../core/shared.js";
import {
  clampLimit,
  createSessionStore,
  messageToSnapshot,
  readOptionalString,
  summarizeSession,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const sessionFinalOutputTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "session_final_output",
      description: "Read final assistant text outputs from a persisted session. This is explicit history lookup, not automatic prompt memory.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Session id to read. Defaults to the current session.",
          },
          limit: {
            type: "number",
            description: "Maximum number of final outputs to return, newest first.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = createSessionStore(context.config);
    const sessionId = readOptionalString(args.session_id) ?? context.sessionId;
    const session = await store.load(sessionId);
    const limit = clampLimit(args.limit, 5);
    const outputs = session.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === "assistant" && !message.tool_calls?.length && Boolean(message.content?.trim()))
      .slice(-limit)
      .reverse()
      .map(({ message, index }) => messageToSnapshot(message, index));

    return okResult(
      JSON.stringify(
        {
          ok: true,
          session: summarizeSession(session),
          finalOutputs: outputs,
        },
        null,
        2,
      ),
    );
  },
};
