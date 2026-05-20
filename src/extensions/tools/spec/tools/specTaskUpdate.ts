import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult } from "../../../shared.js";
import { normalizeSpecTaskStatus, readSpecState, writeSpecState } from "../state.js";

export const specTaskUpdateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_task_update",
      description: "Create or update one task entry in the current session spec state.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          text: { type: "string" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        },
        required: ["task_id", "text", "status"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const taskId = readString(args.task_id, "task_id");
    const state = await readSpecState(context.projectContext.stateRootDir, context.sessionId);
    const existing = state.tasks.find((task) => task.id === taskId);
    const task = existing ?? { id: taskId, text: "", status: "pending" as const };
    task.text = readString(args.text, "text");
    task.status = normalizeSpecTaskStatus(args.status);
    if (!existing) {
      state.tasks.push(task);
    }
    const statePath = await writeSpecState(context.projectContext.stateRootDir, context.sessionId, state);
    return changedJsonResult({ ok: true, task, state }, [statePath]);
  },
};
