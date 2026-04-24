import { terminateBackgroundJob } from "../../execution/background.js";
import { buildBackgroundProcessProtocol } from "../../execution/processProtocol.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import type { ToolExecutionMetadata } from "../../types.js";

export const backgroundTerminateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_terminate",
      description: "Terminate a running background job and close it with an aborted status.",
      parameters: {
        type: "object",
        properties: {
          job_id: {
            type: "string",
            description: "Background job id to terminate.",
          },
          signal: {
            type: "string",
            enum: ["terminate", "kill"],
            description: "Optional termination signal. Defaults to terminate.",
          },
        },
        required: ["job_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const signal = args.signal === "kill" ? "kill" : "terminate";
    const terminated = await terminateBackgroundJob({
      rootDir: context.projectContext.stateRootDir,
      jobId: readString(args.job_id, "job_id"),
      terminatedBy: context.identity.name,
      signal,
    });
    const job = terminated.job;
    const process = buildBackgroundProcessProtocol({
      jobId: job.id,
      status: job.status,
      event: terminated.alreadyTerminal ? "process/read" : "process/terminate",
      exitCode: job.exitCode,
    });
    const collaboration = terminated.alreadyTerminal
      ? undefined
      : {
          action: "close_execution" as const,
          actor: context.identity.name,
          executionId: job.id,
        };
    const metadata: ToolExecutionMetadata = {
      process,
      ...(collaboration ? { collaboration } : {}),
    };

    return okResult(
      JSON.stringify(
        {
          ok: true,
          job,
          already_terminal: terminated.alreadyTerminal,
          idempotent: terminated.idempotent,
          execution_id: job.id,
          process,
          collaboration,
          preview: `[x] ${job.id} ${job.status} (${signal})`,
        },
        null,
        2,
      ),
      metadata,
    );
  },
};
