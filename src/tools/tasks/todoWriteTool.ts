import { formatTodoBlock, normalizeTodoItems } from "../../agent/todos.js";
import { TaskStore } from "../../tasks/store.js";
import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";

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
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "Current task state.",
                },
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
    const args = parseArgs(rawArgs);
    const items = normalizeTodoItems(args.items);
    const completed = items.filter((item) => item.status === "completed").length;
    const inProgress = items.find((item) => item.status === "in_progress")?.id ?? null;
    const taskStore = new TaskStore(context.projectContext.stateRootDir);
    const activeTask = await resolveActiveTask(taskStore, context);
    const syncedTask = activeTask ? await taskStore.setChecklist(activeTask.id, items) : undefined;

    return okResult(
      JSON.stringify(
        {
          ok: true,
          items,
          total: items.length,
          completed,
          inProgress,
          taskId: syncedTask?.id,
          preview: formatTodoBlock(items),
        },
        null,
        2,
      ),
    );
  },
};

async function resolveActiveTask(taskStore: TaskStore, context: Parameters<RegisteredTool["execute"]>[1]) {
  if (context.identity.kind === "subagent") {
    return undefined;
  }

  if (context.identity.kind === "teammate") {
    const owned = await taskStore.findOwnedActive(context.identity.name);
    if (owned) {
      return owned;
    }
  }

  const worktree = await new WorktreeStore(context.projectContext.stateRootDir).findByPath(context.cwd);
  if (!worktree || typeof worktree.taskId !== "number") {
    return undefined;
  }

  try {
    return await taskStore.load(worktree.taskId);
  } catch {
    return undefined;
  }
}
