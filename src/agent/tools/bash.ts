import type { ToolExecutionMetadata } from "../../types.js";
import { classifyCommand } from "../../utils/commandPolicy.js";
import { runCommandWithPolicy } from "../../utils/commandRunner.js";
import { getShellRuntimeInfo } from "../../utils/commandRunner/shellRuntime.js";
import { resolveUserPath, truncateText } from "../../utils/fs.js";
import { clampNumber, okResult, parseArgs, readString } from "../tools/core/shared.js";
import type { RegisteredTool } from "../tools/core/types.js";

const SHELL_RUNTIME = getShellRuntimeInfo();

export const bashToolDefinition: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "bash",
      description: `Run a local terminal command. Current default shell: ${SHELL_RUNTIME.shell} (${SHELL_RUNTIME.invocation}). Use for search, listing, git status, git diff, builds, tests, and other terminal work.`,
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
    const shell = getShellRuntimeInfo();
    const classification = classifyCommand(command);
    const stallTimeoutMs = clampNumber(context.config.commandStallTimeoutMs, 2_000, 300_000, 30_000);
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
    const metadata: ToolExecutionMetadata = {
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
    };

    return okResult(
      JSON.stringify(
        {
          command,
          cwd: resolvedCwd,
          exitCode: result.exitCode,
          status,
          durationMs: result.durationMs,
          attempts: result.attempts,
          truncated: result.truncated,
          outputPath: result.outputPath,
          outputChars: result.outputChars,
          outputBytes: result.outputBytes,
          output: truncateText(result.output, 4_000),
          ...(status === "completed"
            ? {}
            : {
                shell: shell.shell,
                platform: shell.platform,
                shellInvocation: shell.invocation,
                shellGuidance: shell.guidance,
                stalled: result.stalled,
                timedOut: result.timedOut,
                aborted: result.aborted,
                commandKind: classification.kind,
              }),
        },
        null,
        2,
      ),
      metadata,
    );
  },
};
