import { ToolExecutionError } from "../errors.js";
import { resolveUserPath } from "../../utils/fs.js";
import { classifyCommand } from "../../utils/commandPolicy.js";
import { runCommandWithPolicy } from "../../utils/commandRunner.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const runShellTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "run_shell",
      description: "Run a local terminal command in the current working directory or another directory. For webpages, use browser MCP tools first and treat shell fetching as fallback.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute.",
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
    const timeoutMs = clampNumber(args.timeout_ms, 1_000, 600_000, 120_000);
    const resolvedCwd = resolveUserPath(shellCwd, context.cwd);
    const classification = classifyCommand(command);
    const stallTimeoutMs = clampNumber(
      context.config.commandStallTimeoutMs,
      2_000,
      300_000,
      30_000,
    );
    const maxRetries = clampNumber(context.config.commandMaxRetries, 0, 3, 1);
    const retryBackoffMs = clampNumber(context.config.commandRetryBackoffMs, 200, 10_000, 1_500);

    if (classification.preferBackground) {
      throw new ToolExecutionError(
        "Long-running command should run in background_run.",
        {
          code: "PREFER_BACKGROUND",
          details: {
            suggestedTool: "background_run",
          },
        },
      );
    }

    const result = await runCommandWithPolicy({
      command,
      cwd: resolvedCwd,
      timeoutMs,
      stallTimeoutMs,
      abortSignal: context.abortSignal,
      maxRetries,
      retryBackoffMs,
      canRetry: classification.retryable,
    });
    const status = result.stalled
      ? "stalled"
      : result.timedOut
        ? "timed_out"
        : result.exitCode === 0
          ? "completed"
          : "failed";

    return okResult(
      JSON.stringify(
        {
          command,
          cwd: resolvedCwd,
          exitCode: result.exitCode,
          status,
          attempts: result.attempts,
          durationMs: result.durationMs,
          stalled: result.stalled,
          timedOut: result.timedOut,
          commandKind: classification.kind,
          output: result.output,
        },
        null,
        2,
      ),
      classification.validationKind
        ? {
            verification: {
              attempted: true,
              command,
              exitCode: result.exitCode,
              kind: classification.validationKind,
              passed: result.exitCode === 0 && !result.stalled && !result.timedOut,
            },
          }
        : undefined,
    );
  },
};
