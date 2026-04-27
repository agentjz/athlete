import fs from "node:fs";
import path from "node:path";

import type { InteractionShell, InteractionTurnDisplay, ShellInputPort, ShellOutputPort } from "../interaction/shell.js";
import { getProjectStatePaths } from "../project/statePaths.js";

export interface TerminalLogWriter {
  write(text: string): void;
}

export function createTerminalLogWriter(rootDir: string, sessionId: string, now = new Date()): TerminalLogWriter {
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10).replaceAll("-", "");
  const terminalDir = path.join(getProjectStatePaths(rootDir).observabilityDir, "terminal", date);
  fs.mkdirSync(terminalDir, { recursive: true });
  const logPath = path.join(terminalDir, `${safePathPart(sessionId)}.log`);
  return {
    write(text) {
      fs.appendFileSync(logPath, text, "utf8");
    },
  };
}

function safePathPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `session-${process.pid}`;
}

export function mirrorInteractionShellToTerminalLog(
  shell: InteractionShell,
  writer: TerminalLogWriter,
): InteractionShell {
  return {
    input: mirrorInput(shell.input, writer),
    output: mirrorOutput(shell.output, writer),
    createTurnDisplay(options) {
      return mirrorTurnDisplay(shell.createTurnDisplay(options), writer);
    },
    dispose() {
      shell.dispose?.();
    },
  };
}

function mirrorInput(input: ShellInputPort, writer: TerminalLogWriter): ShellInputPort {
  return {
    async readInput(promptLabel) {
      const result = await input.readInput(promptLabel);
      if (result.kind === "submit") {
        writer.write(`${promptLabel ?? "> "}${result.value}\n`);
      }
      return result;
    },
    async readMultiline(promptLabel) {
      const result = await input.readMultiline(promptLabel);
      if (result.kind === "submit") {
        writer.write(`${promptLabel ?? "... "}${result.value}\n`);
      } else if (result.kind === "cancel") {
        writer.write(`${promptLabel ?? "... "}::cancel\n`);
      }
      return result;
    },
    bindInterrupt(handler) {
      return input.bindInterrupt(handler);
    },
  };
}

function mirrorOutput(output: ShellOutputPort, writer: TerminalLogWriter): ShellOutputPort {
  return {
    plain(text) {
      writer.write(`${text}\n`);
      output.plain(text);
    },
    info(text) {
      writer.write(`${text}\n`);
      output.info(text);
    },
    warn(text) {
      writer.write(`${text}\n`);
      output.warn(text);
    },
    error(text) {
      writer.write(`${text}\n`);
      output.error(text);
    },
    dim(text) {
      writer.write(`${text}\n`);
      output.dim(text);
    },
    heading(text) {
      writer.write(`${text}\n`);
      output.heading(text);
    },
    tool(text) {
      writer.write(`${text}\n`);
      output.tool(text);
    },
    interrupt(text) {
      writer.write(`${text}\n`);
      output.interrupt(text);
    },
  };
}

function mirrorTurnDisplay(display: InteractionTurnDisplay, writer: TerminalLogWriter): InteractionTurnDisplay {
  return {
    callbacks: {
      ...display.callbacks,
      onAssistantDelta(delta) {
        writer.write(delta);
        display.callbacks.onAssistantDelta?.(delta);
      },
      onAssistantText(text) {
        writer.write(text);
        display.callbacks.onAssistantText?.(text);
      },
      onAssistantDone(text) {
        display.callbacks.onAssistantDone?.(text);
      },
      onReasoningDelta(delta) {
        writer.write(delta);
        display.callbacks.onReasoningDelta?.(delta);
      },
      onReasoning(text) {
        writer.write(text);
        display.callbacks.onReasoning?.(text);
      },
      onStatus(message) {
        writer.write(`${message}\n`);
        display.callbacks.onStatus?.(message);
      },
      onToolCall(name, args) {
        writer.write(`[tool:call] ${name}${formatToolPayloadReceipt(args)}\n`);
        display.callbacks.onToolCall?.(name, args);
      },
      onToolResult(name, output) {
        writer.write(`[tool:result] ${name}${formatToolPayloadReceipt(output)}\n`);
        display.callbacks.onToolResult?.(name, output);
      },
      onToolError(name, error) {
        writer.write(`[tool:error] ${name}${formatToolPayloadReceipt(error)}\n`);
        display.callbacks.onToolError?.(name, error);
      },
    },
    flush() {
      display.flush();
    },
    dispose() {
      display.dispose();
    },
  };
}

function formatToolPayloadReceipt(value: string): string {
  const bytes = Buffer.byteLength(value ?? "", "utf8");
  return bytes > 0 ? ` (${bytes} bytes)` : "";
}
