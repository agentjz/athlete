import { parseArgs, okResult } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { formatTodoBlock, normalizeTodoItems } from "../../../../session/todos.js";

export const todoWriteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "todo_write",
      description:
        "Update the structured todo list for the current task. Keep it short, set at most one item to in_progress, and mark items completed as you finish them.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "The full current todo list.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Stable short id such as 1, 2, 3.",
                },
                text: {
                  type: "string",
                  description: "Short actionable task description.",
                },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              },
              required: ["id", "text", "status"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    void context;
    const args = parseArgs(rawArgs);
    const items = normalizeTodoItems(args.items);
    const completed = items.filter((item) => item.status === "completed").length;
    const inProgress = items.find((item) => item.status === "in_progress")?.id ?? null;

    return okResult(JSON.stringify({
      ok: true,
      items,
      total: items.length,
      completed,
      inProgress,
      preview: formatTodoBlock(items),
    }, null, 2));
  },
};
