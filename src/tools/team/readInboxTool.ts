import { MessageBus } from "../../team/messageBus.js";
import { okResult } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const readInboxTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_inbox",
      description: "Read and drain the inbox for the current actor.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  async execute(_rawArgs, context) {
    const bus = new MessageBus(context.projectContext.stateRootDir);
    const messages = await bus.readInbox(context.identity.name);
    return okResult(
      JSON.stringify(
        {
          ok: true,
          actor: context.identity.name,
          messages,
          preview:
            messages.length > 0
              ? messages
                  .slice(0, 8)
                  .map((message) => `${message.type} from ${message.from}: ${message.content}`)
                  .join("\n")
              : "Inbox empty.",
        },
        null,
        2,
      ),
    );
  },
};
