import { ToolExecutionError } from "../../core/errors.js";
import { buildForegroundProcessProtocol } from "../../../../execution/processProtocol.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import { classifyCommand } from "../../../../utils/commandPolicy.js";
import { runCommandWithPolicy } from "../../../../utils/commandRunner.js";
import { clampNumber, okResult, parseArgs, readString } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import type { ToolExecutionMetadata } from "../../../../types.js";

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

    const result = await runCommandWithPolicy({
      command,
      cwd: resolvedCwd,
      timeoutMs,
      stallTimeoutMs,
      abortSignal: context.abortSignal,
      maxRetries,
      retryBackoffMs,
      canRetry: classification.retryable,
      outputCapture: {
        stateRootDir: context.projectContext.stateRootDir,
        sessionId: context.sessionId,
      },
    });
    const status = result.aborted
      ? "aborted"
      : result.stalled
      ? "stalled"
      : result.timedOut
        ? "timed_out"
        : result.exitCode === 0
          ? "completed"
          : "failed";
    const process = buildForegroundProcessProtocol({
      sessionId: context.sessionId,
      runtimeStatus: status,
      exitCode: result.exitCode,
    });
    const metadata: ToolExecutionMetadata = {
      process,
      runtime: {
        status,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        attempts: result.attempts,
        timedOut: result.timedOut,
        stalled: result.stalled,
        aborted: result.aborted,
        truncated: result.truncated,
        outputPath: result.outputPath,
        outputPreview: result.output,
      },
      ...(classification.validationKind
        ? {
            verification: {
              attempted: true,
              command,
              exitCode: result.exitCode,
              kind: classification.validationKind,
              passed: result.exitCode === 0 && !result.stalled && !result.timedOut && !result.aborted,
            },
          }
        : {}),
    };

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
          aborted: result.aborted,
          truncated: result.truncated,
          outputPath: result.outputPath,
          outputChars: result.outputChars,
          outputBytes: result.outputBytes,
          commandKind: classification.kind,
          process,
          output: result.output,
        },
        null,
        2,
      ),
      metadata,
    );
  },
};
