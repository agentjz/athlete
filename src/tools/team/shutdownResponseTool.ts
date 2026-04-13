import { MessageBus } from "../../team/messageBus.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";
import { TeamStore } from "../../team/store.js";
import { okResult, parseArgs, readRequiredBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const shutdownResponseTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "shutdown_response",
      description:
        "For lead: check shutdown request status by request_id. For teammates: approve or reject an incoming shutdown request.",
      parameters: {
        type: "object",
        properties: {
          request_id: {
            type: "string",
            description: "Shutdown request id.",
          },
          approve: {
            type: "boolean",
            description: "Teammate response: approve or reject shutdown.",
          },
          reason: {
            type: "string",
            description: "Optional response reason.",
          },
        },
        required: ["request_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const requestId = readString(args.request_id, "request_id");
    const requestStore = new ProtocolRequestStore(context.projectContext.stateRootDir);

    if (context.identity.kind === "lead") {
      const request = await requestStore.load(requestId);
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

    if (context.identity.kind !== "teammate") {
      throw new Error("Only teammates can send shutdown_response.");
    }

    const approve = readRequiredBoolean(args.approve, "approve");
    const reason = typeof args.reason === "string" ? args.reason : "";
    const current = await requestStore.loadOrThrow(requestId);
    if (current.kind !== "shutdown") {
      throw new Error(`Protocol request ${requestId} is '${current.kind}', not 'shutdown'.`);
    }
    if (current.to !== context.identity.name) {
      throw new Error(`Shutdown request ${requestId} targets '${current.to}', not '${context.identity.name}'.`);
    }

    const request = await requestStore.resolve(requestId, {
      approve,
      feedback: reason,
      respondedBy: context.identity.name,
    });
    const bus = new MessageBus(context.projectContext.stateRootDir);
    await bus.send(context.identity.name, current.from, reason, "protocol_response", {
      protocolKind: request.kind,
      requestId,
      approve,
      feedback: reason,
    });
    if (approve) {
      await new TeamStore(context.projectContext.stateRootDir).updateMemberStatus(context.identity.name, "shutdown");
    }

    return okResult(
      JSON.stringify(
        {
          ok: true,
          request,
          preview: `Shutdown ${approve ? "approved" : "rejected"}`,
        },
        null,
        2,
      ),
    );
  },
};
