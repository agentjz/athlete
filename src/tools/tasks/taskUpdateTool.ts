import { TaskStore } from "../../tasks/store.js";
import { okResult, parseArgs, readOptionalNumber } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const taskUpdateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "task_update",
      description: "Update task status, dependencies, assignee, or owner on the persistent task board.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "Task id.",
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"],
            description: "Optional next status.",
          },
          add_blocked_by: {
            type: "array",
            items: { type: "number" },
            description: "Optional dependency ids blocking this task.",
          },
          add_blocks: {
            type: "array",
            items: { type: "number" },
            description: "Optional task ids blocked by this task.",
          },
          owner: {
            type: "string",
            description: "Optional task owner name.",
          },
          assignee: {
            type: "string",
            description: "Optional teammate this task is reserved for. Empty string clears it.",
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const taskId = readOptionalNumber(args.task_id);
    if (!taskId) {
      throw new Error('Tool argument "task_id" must be a positive number.');
    }

    const store = new TaskStore(context.projectContext.stateRootDir);
    const current = await store.load(taskId);
    const nextStatus = typeof args.status === "string" ? readTaskStatus(args.status) : undefined;
    const nextOwner = typeof args.owner === "string" ? normalizeOptionalText(args.owner) : undefined;
    const nextAssignee = typeof args.assignee === "string" ? normalizeOptionalText(args.assignee) : undefined;
    const nextBlockedBy = readNumberArray(args.add_blocked_by);
    const nextBlocks = readNumberArray(args.add_blocks);

    if (context.identity.kind === "teammate") {
      if (nextOwner !== undefined) {
        throw new Error("Teammates cannot change task owner directly; use claim_task instead.");
      }
      if (nextAssignee !== undefined) {
        throw new Error("Teammates cannot change task assignee.");
      }
      if (nextBlockedBy && nextBlockedBy.length > 0) {
        throw new Error("Teammates cannot change task dependencies.");
      }
      if (nextBlocks && nextBlocks.length > 0) {
        throw new Error("Teammates cannot change task dependencies.");
      }
      if (nextStatus && current.owner !== context.identity.name) {
        throw new Error(`Task ${taskId} is owned by ${current.owner || "nobody"}, not ${context.identity.name}.`);
      }
    }

    const task = await store.update(taskId, {
      status: nextStatus,
      addBlockedBy: nextBlockedBy,
      addBlocks: nextBlocks,
      owner: nextOwner,
      assignee: nextAssignee,
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

function readTaskStatus(value: string): "pending" | "in_progress" | "completed" {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }

  throw new Error(`Invalid task status: ${value}`);
}

function readNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => Math.trunc(entry as number))
    .filter((entry) => entry > 0);
}

function normalizeOptionalText(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
