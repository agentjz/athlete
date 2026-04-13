import { CoordinationPolicyStore } from "../../team/policyStore.js";
import { okResult, parseArgs, readBoolean } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const coordinationPolicyTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "coordination_policy",
      description:
        "Read or update the lead's machine-level coordination gates for plan decisions and shutdown requests.",
      parameters: {
        type: "object",
        properties: {
          allow_plan_decisions: {
            type: "boolean",
            description: "Whether the lead is currently allowed to approve or reject pending plan requests.",
          },
          allow_shutdown_requests: {
            type: "boolean",
            description: "Whether the lead is currently allowed to issue shutdown requests.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new CoordinationPolicyStore(context.projectContext.stateRootDir);
    const current = await store.load();
    const wantsUpdate =
      typeof args.allow_plan_decisions === "boolean" ||
      typeof args.allow_shutdown_requests === "boolean";

    if (wantsUpdate && context.identity.kind !== "lead") {
      throw new Error("Only the lead can update coordination policy.");
    }

    const policy = wantsUpdate
      ? await store.update({
          allowPlanDecisions: readBoolean(args.allow_plan_decisions, current.allowPlanDecisions),
          allowShutdownRequests: readBoolean(args.allow_shutdown_requests, current.allowShutdownRequests),
        })
      : current;

    return okResult(
      JSON.stringify(
        {
          ok: true,
          policy,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
