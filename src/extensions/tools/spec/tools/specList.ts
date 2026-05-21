import { parseArgs, readOptionalNumber } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore } from "../../../../spec/store.js";
import { specJsonResult } from "../shared.js";

export const specListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_list",
      description: "List durable specs as a read-only index.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum specs to list." },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const specs = await new SpecStore(context.projectContext.stateRootDir).list(readOptionalNumber(args.limit) ?? 20);
    return specJsonResult({ specs });
  },
};
