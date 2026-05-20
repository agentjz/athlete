import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { readSpecDocument } from "../state.js";

export const specSearchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_search",
      description: "Search the current session spec.md document for a literal query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const query = readString(args.query, "query");
    const document = await readSpecDocument(context.projectContext.stateRootDir, context.sessionId);
    const matches = document
      .split(/\r?\n/)
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter((line) => line.text.includes(query));
    return jsonResult({ ok: true, query, matches });
  },
};
