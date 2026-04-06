import { reconcileTeamState } from "../../team/reconcile.js";
import { TaskStore } from "../../tasks/store.js";
import { WorktreeStore } from "../../worktrees/store.js";
import { okResult, parseArgs, readOptionalNumber } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const claimTaskTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "claim_task",
      description: "Claim an existing project task for the current actor and mark it in progress.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "number",
            description: "Task id.",
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    await reconcileTeamState(context.projectContext.stateRootDir).catch(() => null);
    const args = parseArgs(rawArgs);
    const taskId = readOptionalNumber(args.task_id);
    if (!taskId) {
      throw new Error('Tool argument "task_id" must be a positive number.');
    }

    const store = new TaskStore(context.projectContext.stateRootDir);
    const task = await store.claim(taskId, context.identity.name);
    let worktree: Awaited<ReturnType<WorktreeStore["ensureForTask"]>> | undefined;
    let worktreeError: string | undefined;
    try {
      worktree = await new WorktreeStore(context.projectContext.stateRootDir).ensureForTask(task.id, task.subject);
    } catch (error) {
      worktreeError = String((error as { message?: unknown }).message ?? error);
    }

    return okResult(
      JSON.stringify(
        {
          ok: true,
          task,
          worktree,
          worktreeError,
          preview: await store.summarize(),
        },
        null,
        2,
      ),
    );
  },
};
