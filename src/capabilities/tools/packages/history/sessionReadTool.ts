import { okResult, parseArgs, readOptionalNumber } from "../../core/shared.js";
import {
  clampLimit,
  clampMessageChars,
  createSessionStore,
  messageToSnapshot,
  readBoolean,
  readOptionalString,
  summarizeSession,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const sessionReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "session_read",
      description: "Read messages from a persisted session snapshot. History is returned only when explicitly requested by the model.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Session id to read. Defaults to the current session.",
          },
          start_index: {
            type: "number",
            description: "0-based message index to start reading from.",
          },
          message_index: {
            type: "number",
            description: "Read exactly one 0-based message index.",
          },
          limit: {
            type: "number",
            description: "Maximum number of messages to return.",
          },
          include_tool_payloads: {
            type: "boolean",
            description: "Include externalized tool-result preview payloads inline. Defaults to false.",
          },
          max_chars_per_message: {
            type: "number",
            description: "Maximum characters per returned message content.",
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
    const messageIndex = readOptionalNumber(args.message_index);
    const startIndex = messageIndex ?? Math.max(0, readOptionalNumber(args.start_index) ?? 0);
    const limit = messageIndex !== undefined ? 1 : clampLimit(args.limit, 80);
    const maxChars = clampMessageChars(args.max_chars_per_message);
    const includeToolPayloads = readBoolean(args.include_tool_payloads);
    const messages = session.messages
      .slice(startIndex, startIndex + limit)
      .map((message, offset) => messageToSnapshot(message, startIndex + offset, {
        includeToolPayloads,
        maxChars,
      }));

    return okResult(
      JSON.stringify(
        {
          ok: true,
          session: summarizeSession(session),
          range: {
            startIndex,
            count: messages.length,
            totalMessages: session.messages.length,
          },
          messages,
        },
        null,
        2,
      ),
    );
  },
};
