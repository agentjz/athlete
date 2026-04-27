import { MessageBus } from "../../../team/messageBus.js";
import { okResult, parseArgs, readString } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import type { ToolExecutionMetadata } from "../../../../types.js";

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
    const to = readString(args.to, "to");
    const content = readString(args.content, "content");
    const bus = new MessageBus(context.projectContext.stateRootDir);
    const message = await bus.send(
      context.identity.name,
      to,
      content,
      args.msg_type === "broadcast" ? "broadcast" : "message",
    );
    const collaboration = {
      action: "send_message" as const,
      from: context.identity.name,
      to,
    };
    const metadata: ToolExecutionMetadata = {
      collaboration,
    };
    return okResult(
      JSON.stringify(
        {
          ok: true,
          message,
          collaboration,
          preview: `Sent ${message.type} to ${to}`,
        },
        null,
        2,
      ),
      metadata,
    );
  },
};
