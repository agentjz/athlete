import { MessageBus } from "../../team/messageBus.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const sendMessageTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a message to a teammate or the lead.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Target actor name.",
          },
          content: {
            type: "string",
            description: "Message body.",
          },
          msg_type: {
            type: "string",
            enum: ["message", "broadcast"],
            description: "Optional message type.",
          },
        },
        required: ["to", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const bus = new MessageBus(context.projectContext.stateRootDir);
    const message = await bus.send(
      context.identity.name,
      readString(args.to, "to"),
      readString(args.content, "content"),
      args.msg_type === "broadcast" ? "broadcast" : "message",
    );
    return okResult(
      JSON.stringify(
        {
          ok: true,
          message,
          preview: `Sent ${message.type} to ${args.to}`,
        },
        null,
        2,
      ),
    );
  },
};
