import { MessageBus } from "../../team/messageBus.js";
import { CoordinationPolicyStore } from "../../team/policyStore.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";
import { okResult, parseArgs, readRequiredBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const planApprovalTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "plan_approval",
      description:
        "For teammates: submit a plan for lead approval using {plan}. For lead: approve or reject a pending plan using {request_id, approve, feedback}.",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description: "Teammate plan text to submit for approval.",
          },
          request_id: {
            type: "string",
            description: "Lead review target request id.",
          },
          approve: {
            type: "boolean",
            description: "Lead review decision.",
          },
          feedback: {
            type: "string",
            description: "Optional review feedback.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new ProtocolRequestStore(context.projectContext.stateRootDir);
    const bus = new MessageBus(context.projectContext.stateRootDir);
    const policyStore = new CoordinationPolicyStore(context.projectContext.stateRootDir);

    if (context.identity.kind === "teammate") {
      const plan = readString(args.plan, "plan");
      const request = await store.create({
        kind: "plan_approval",
        from: context.identity.name,
        to: "lead",
        subject: `Plan review from ${context.identity.name}`,
        content: plan,
      });
      await bus.send(context.identity.name, "lead", plan, "protocol_request", {
        protocolKind: request.kind,
        requestId: request.id,
        subject: request.subject,
      });
      return okResult(
        JSON.stringify(
          {
            ok: true,
            request,
            preview: `Plan request ${request.id} submitted to lead`,
          },
          null,
          2,
        ),
      );
    }

    if (context.identity.kind !== "lead") {
      throw new Error("Only teammates can submit plans and only the lead can review them.");
    }

    const requestId = readString(args.request_id, "request_id");
    if (typeof args.approve !== "boolean") {
      const request = await store.load(requestId);
      return okResult(
        JSON.stringify(
          {
            ok: true,
            request,
            preview: request ? `${request.id}: ${request.status}` : "not found",
          },
          null,
          2,
        ),
      );
    }

    const policy = await policyStore.load();
    if (!policy.allowPlanDecisions) {
      throw new Error(
        "Plan decisions are currently locked by coordination policy. Use coordination_policy to allow plan decisions before approving or rejecting requests.",
      );
    }

    const approve = readRequiredBoolean(args.approve, "approve");
    const feedback = typeof args.feedback === "string" ? args.feedback : "";
    const current = await store.loadOrThrow(requestId);
    if (current.kind !== "plan_approval") {
      throw new Error(`Protocol request ${requestId} is '${current.kind}', not 'plan_approval'.`);
    }
    if (current.to !== context.identity.name) {
      throw new Error(`Plan request ${requestId} targets '${current.to}', not '${context.identity.name}'.`);
    }

    const request = await store.resolve(requestId, {
      approve,
      feedback,
      respondedBy: context.identity.name,
    });
    await bus.send(context.identity.name, current.from, feedback, "protocol_response", {
      protocolKind: request.kind,
      requestId,
      approve,
      feedback,
    });
    return okResult(
      JSON.stringify(
        {
          ok: true,
          request,
          preview: `Plan ${request.status} for ${request.from}`,
        },
        null,
        2,
      ),
    );
  },
};
