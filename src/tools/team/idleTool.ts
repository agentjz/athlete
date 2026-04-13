import { TeamStore } from "../../team/store.js";
import { okResult } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const idleTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "idle",
      description: "Enter or report idle state. Useful for autonomous teammates waiting for new work.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    if (context.identity.kind === "teammate") {
      const store = new TeamStore(context.projectContext.stateRootDir);
      await store.updateMemberStatus(context.identity.name, "idle");
      return okResult(
        JSON.stringify(
          {
            ok: true,
            idle: true,
            actor: context.identity.name,
            preview: `${context.identity.name} is now idle.`,
          },
          null,
          2,
        ),
      );
    }

    return okResult(
      JSON.stringify(
        {
          ok: true,
          idle: false,
          actor: context.identity.name,
          preview: "Lead does not idle.",
        },
        null,
        2,
      ),
    );
  },
};
