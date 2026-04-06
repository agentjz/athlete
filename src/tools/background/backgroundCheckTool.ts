import { BackgroundJobStore } from "../../background/store.js";
import { reconcileBackgroundJobs } from "../../background/reconcile.js";
import { classifyCommand } from "../../utils/commandPolicy.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const backgroundCheckTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_check",
      description: "Inspect a background job by id, or list recent background jobs.",
      parameters: {
        type: "object",
        properties: {
          job_id: {
            type: "string",
            description: "Optional background job id.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    await reconcileBackgroundJobs(context.projectContext.stateRootDir).catch(() => null);
    const store = new BackgroundJobStore(context.projectContext.stateRootDir);
    const jobId = typeof args.job_id === "string" ? readString(args.job_id, "job_id") : undefined;

    if (jobId) {
      const job = await store.load(jobId);
      const classification = classifyCommand(job.command);
      return okResult(
        JSON.stringify(
          {
            ok: true,
            job,
            preview: await store.summarize({
              cwd: context.cwd,
              requestedBy: context.identity.name,
            }),
          },
          null,
          2,
        ),
        classification.validationKind && job.status !== "running"
          ? {
              verification: {
                attempted: true,
                command: job.command,
                exitCode: typeof job.exitCode === "number" ? job.exitCode : null,
                kind: classification.validationKind,
                passed: job.exitCode === 0 && job.status === "completed",
              },
            }
          : undefined,
      );
    }

    const jobs = await store.list();
    return okResult(
      JSON.stringify(
        {
          ok: true,
          jobs: await store.listRelevant({
            cwd: context.cwd,
            requestedBy: context.identity.name,
          }),
          preview: await store.summarize({
            cwd: context.cwd,
            requestedBy: context.identity.name,
          }),
        },
        null,
        2,
      ),
    );
  },
};
