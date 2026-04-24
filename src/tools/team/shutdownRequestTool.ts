import { MessageBus } from "../../team/messageBus.js";
import { ProtocolRequestStore } from "../../team/requestStore.js";
import { getTeammateShutdownConflict } from "../../team/stateLocks.js";
import { TeamStore } from "../../team/store.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const shutdownRequestTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "shutdown_request",
      description: "Request a teammate to shut down gracefully.",
      parameters: {
        type: "object",
        properties: {
          teammate: {
            type: "string",
            description: "Target teammate name.",
          },
          reason: {
            type: "string",
            description: "Optional shutdown reason.",
          },
        },
        required: ["teammate"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    if (context.identity.kind !== "lead") {
      throw new Error("Only the lead can issue shutdown_request.");
    }

    const args = parseArgs(rawArgs);
    const teammate = readString(args.teammate, "teammate");
    const reason = typeof args.reason === "string" ? args.reason : "Please shut down gracefully.";
    const teamStore = new TeamStore(context.projectContext.stateRootDir);
    const member = await teamStore.findMember(teammate);
    if (!member) {
      throw new Error(`Unknown teammate: ${teammate}`);
    }
    const conflict = await getTeammateShutdownConflict(context.projectContext.stateRootDir, member);
    if (conflict) {
      throw new Error(`Shutdown request blocked by active teammate state. ${conflict.reason}`);
    }

    const store = new ProtocolRequestStore(context.projectContext.stateRootDir);
    const request = await store.create({
      kind: "shutdown",
      from: context.identity.name,
      to: member.name,
      subject: `Graceful shutdown for ${member.name}`,
      content: reason,
    });
    const bus = new MessageBus(context.projectContext.stateRootDir);
    await bus.send(context.identity.name, member.name, reason, "protocol_request", {
      protocolKind: request.kind,
      requestId: request.id,
      subject: request.subject,
    });
    return okResult(
      JSON.stringify(
        {
          ok: true,
          request,
          preview: `Shutdown request ${request.id} sent to ${member.name}`,
        },
        null,
        2,
      ),
    );
  },
};
