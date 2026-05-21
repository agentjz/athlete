import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { SpecStore } from "../../../../spec/store.js";
import { specJsonResult } from "../shared.js";

export const specCheckpointListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_list",
      description: "List recovery checkpoints for a durable spec.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const checkpoints = await new SpecStore(context.projectContext.stateRootDir).listCheckpoints(
      readString(args.specId, "specId"),
    );
    return specJsonResult({ checkpoints });
  },
};
