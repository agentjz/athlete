import { reconcileTeamState } from "../../team/reconcile.js";
import { TeamStore } from "../../team/store.js";
import { okResult } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const listTeammatesTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "list_teammates",
      description: "List all registered teammates and their current status.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    await reconcileTeamState(context.projectContext.stateRootDir).catch(() => null);
    const store = new TeamStore(context.projectContext.stateRootDir);
    const members = await store.listMembers();
    return okResult(
      JSON.stringify(
        {
          ok: true,
          members,
          preview: await store.summarizeMembers(),
        },
        null,
        2,
      ),
    );
  },
};
