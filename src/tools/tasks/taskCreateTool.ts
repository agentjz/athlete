import { TaskStore } from "../../tasks/store.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const taskCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task_create",
      description: "Create a persistent task in the project task board.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Short task title.",
          },
          description: {
            type: "string",
            description: "Optional task details.",
          },
          assignee: {
            type: "string",
            description: "Optional teammate this task is reserved for.",
          },
        },
        required: ["subject"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new TaskStore(context.projectContext.stateRootDir);
    const task = await store.create(readString(args.subject, "subject"), typeof args.description === "string" ? args.description : "", {
      assignee: typeof args.assignee === "string" ? args.assignee : undefined,
    });
    return okResult(
      JSON.stringify(
        {
          ok: true,
          task,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
