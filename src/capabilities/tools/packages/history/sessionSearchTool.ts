import { okResult, parseArgs, readString } from "../../core/shared.js";
import {
  buildMatchPreview,
  buildSearchText,
  clampLimit,
  createSessionStore,
  readBoolean,
  summarizeSession,
} from "./historyShared.js";
import type { RegisteredTool } from "../../core/types.js";

export const sessionSearchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "session_search",
      description: "Search persisted session snapshots by literal text. Returns matching message indexes and previews only.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Literal text to search for.",
          },
          case_sensitive: {
            type: "boolean",
            description: "Whether the literal search is case sensitive.",
          },
          limit: {
            type: "number",
            description: "Maximum number of matches to return.",
          },
          session_limit: {
            type: "number",
            description: "Maximum number of recent sessions to scan.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const query = readString(args.query, "query");
    const caseSensitive = readBoolean(args.case_sensitive);
    const limit = clampLimit(args.limit, 40);
    const sessionLimit = clampLimit(args.session_limit, 80);
    const sessions = await createSessionStore(context.config).list(sessionLimit);
    const needle = caseSensitive ? query : query.toLowerCase();
    const matches: Array<Record<string, unknown>> = [];

    for (const session of sessions) {
      for (let index = 0; index < session.messages.length; index += 1) {
        const message = session.messages[index];
        if (!message) {
          continue;
        }

        const text = buildSearchText(message);
        const haystack = caseSensitive ? text : text.toLowerCase();
        if (!haystack.includes(needle)) {
          continue;
        }

        matches.push({
          session: summarizeSession(session),
          messageIndex: index,
          role: message.role,
          name: message.name,
          createdAt: message.createdAt,
          preview: buildMatchPreview(text, query, caseSensitive),
        });

        if (matches.length >= limit) {
          return okResult(JSON.stringify({ ok: true, query, matches, truncated: true }, null, 2));
        }
      }
    }

    return okResult(JSON.stringify({ ok: true, query, matches, truncated: false }, null, 2));
  },
};
