import { MessageBus } from "../../team/messageBus.js";
import { TeamStore } from "../../team/store.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const broadcastTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "broadcast",
      description: "Broadcast a message to all registered teammates except the sender.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Broadcast body.",
          },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const teamStore = new TeamStore(context.projectContext.stateRootDir);
    const members = await teamStore.listMembers();
    const bus = new MessageBus(context.projectContext.stateRootDir);
    const count = await bus.broadcast(
      context.identity.name,
      readString(args.content, "content"),
      members.map((member) => member.name),
    );

    return okResult(
      JSON.stringify(
        {
          ok: true,
          count,
          preview: `Broadcast to ${count} teammates`,
        },
        null,
        2,
      ),
    );
  },
};
