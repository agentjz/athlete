import { parseArgs, readOptionalNumber, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore } from "../../../../spec/store.js";
import { specJsonResult } from "../shared.js";

export const specSearchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_search",
      description: "Search durable specs by title, summary, and document text.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          limit: { type: "number", description: "Maximum specs to return." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const specs = await new SpecStore(context.projectContext.stateRootDir).search(
      readString(args.query, "query"),
      readOptionalNumber(args.limit) ?? 20,
    );
    return specJsonResult({ specs });
  },
};
