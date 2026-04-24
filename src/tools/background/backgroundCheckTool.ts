import { BackgroundJobStore, reconcileBackgroundJobs } from "../../execution/background.js";
import { buildBackgroundProcessProtocol } from "../../execution/processProtocol.js";
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
      const process = buildBackgroundProcessProtocol({
        jobId: job.id,
        status: job.status,
        event: "process/read",
        exitCode: job.exitCode,
      });
      return okResult(
        JSON.stringify(
          {
            ok: true,
            job,
            process,
            preview: await store.summarize({
              cwd: context.cwd,
              requestedBy: context.identity.name,
            }),
          },
          null,
          2,
        ),
        {
          process,
          ...(classification.validationKind && job.status !== "running"
            ? {
                verification: {
                  attempted: true,
                  command: job.command,
                  exitCode: typeof job.exitCode === "number" ? job.exitCode : null,
                  kind: classification.validationKind,
                  passed: job.exitCode === 0 && job.status === "completed",
                },
              }
            : {}),
        },
      );
    }

    const jobs = await store.listRelevant({
      cwd: context.cwd,
      requestedBy: context.identity.name,
    });
    const process = jobs.length > 0
      ? buildBackgroundProcessProtocol({
        jobId: jobs[0]!.id,
        status: jobs[0]!.status,
        event: "process/read",
        exitCode: jobs[0]!.exitCode,
      })
      : undefined;
    return okResult(
      JSON.stringify(
        {
          ok: true,
          jobs,
          process,
          preview: await store.summarize({
            cwd: context.cwd,
            requestedBy: context.identity.name,
          }),
        },
        null,
        2,
      ),
      process ? { process } : undefined,
    );
  },
};
