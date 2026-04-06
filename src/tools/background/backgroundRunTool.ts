import { spawnBackgroundProcess } from "../../background/spawn.js";
import { BackgroundJobStore } from "../../background/store.js";
import { assertPathAllowed } from "../../utils/fs.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const backgroundRunTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_run",
      description: "Run a long shell command in the background and return immediately.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute asynchronously.",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const command = readString(args.command, "command");
    const shellCwd = typeof args.cwd === "string" ? args.cwd : context.cwd;
    const resolvedCwd = assertPathAllowed(shellCwd, context.cwd, context.config);
    const timeoutMs = clampNumber(args.timeout_ms, 1_000, 600_000, 120_000);
    const stallTimeoutMs = clampNumber(context.config.commandStallTimeoutMs, 2_000, 300_000, 30_000);
    const store = new BackgroundJobStore(context.projectContext.stateRootDir);
    const job = await store.create({
      command,
      cwd: resolvedCwd,
      requestedBy: context.identity.name,
      timeoutMs,
      stallTimeoutMs,
    });
    const pid = spawnBackgroundProcess({
      rootDir: context.projectContext.stateRootDir,
      jobId: job.id,
    });
    const nextJob = await store.setPid(job.id, pid);

    return okResult(
      JSON.stringify(
        {
          ok: true,
          job: nextJob,
          preview: await store.summarize({
            cwd: resolvedCwd,
            requestedBy: context.identity.name,
          }),
        },
        null,
        2,
      ),
    );
  },
};
