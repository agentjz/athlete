import { buildToolCallDisplay, buildToolResultDisplay } from "./toolDisplay.js";
import {
  normalizeTerminalVerbosity,
  shouldShowToolCallPreview,
  shouldShowToolResultPreview,
  truncateVisiblePreview,
  type TerminalVerbosity,
} from "./previewPolicy.js";
import { colorizeTodoMarkers } from "../ui/todoStyling.js";
import { writeStdout, writeStdoutLine } from "../utils/stdio.js";
import type { RuntimeUiChannel, RuntimeUiEvent } from "./events.js";
import { colorRuntimeUiText, formatRuntimeUiChannelHeader, formatRuntimeUiSemanticTag } from "./theme.js";

export interface RuntimeUiTerminalRenderer {
  render(event: RuntimeUiEvent): void;
  flush(): void;
}

export interface RuntimeUiFormatOptions {
  cwd?: string;
  terminalVerbosity?: TerminalVerbosity;
  toolArgsMaxChars?: number;
}

export function createRuntimeUiTerminalRenderer(options: {
  cwd?: string;
  showReasoning?: boolean;
  terminalVerbosity?: TerminalVerbosity;
  assistantLeadingBlankLine?: boolean;
  assistantTrailingNewlines?: string;
  reasoningLeadingBlankLine?: boolean;
  toolArgsMaxChars?: number;
} = {}): RuntimeUiTerminalRenderer {
  const verbosity = normalizeTerminalVerbosity(options.terminalVerbosity);
  const state = {
    assistantOpen: false,
    reasoningOpen: false,
    channel: undefined as RuntimeUiChannel | undefined,
  };

  const flush = (): void => {
    if (!state.reasoningOpen && !state.assistantOpen) {
      return;
    }
    writeStdout("\n");
    state.reasoningOpen = false;
    state.assistantOpen = false;
  };

  const beginReasoning = (channel: RuntimeUiChannel): void => {
    if (options.showReasoning !== true) {
      return;
    }
    ensureChannel(channel);
    if (!state.reasoningOpen) {
      const label = colorRuntimeUiText("system", "[reasoning]");
      writeStdout(options.reasoningLeadingBlankLine ? `\n${label}\n` : `${label}\n`);
      state.reasoningOpen = true;
    }
  };

  const beginAssistant = (channel: RuntimeUiChannel): void => {
    ensureChannel(channel);
    if (state.reasoningOpen) {
      writeStdout("\n");
      state.reasoningOpen = false;
    }
    if (!state.assistantOpen) {
      if (options.assistantLeadingBlankLine) {
        writeStdout("\n");
      }
      state.assistantOpen = true;
    }
  };

  const ensureChannel = (channel: RuntimeUiChannel): void => {
    if (state.channel === channel) {
      return;
    }
    if (state.reasoningOpen || state.assistantOpen) {
      writeStdout("\n");
      state.reasoningOpen = false;
      state.assistantOpen = false;
    }
    if (state.channel !== undefined) {
      writeStdout("\n");
    }
    writeStdoutLine(formatRuntimeUiChannelHeader(channel));
    state.channel = channel;
  };

  return {
    flush,
    render(event) {
      switch (event.kind) {
        case "assistant_text":
          beginAssistant(event.channel);
          writeStdout(event.message ?? "");
          return;
        case "reasoning":
          if (options.showReasoning !== true) {
            return;
          }
          beginReasoning(event.channel);
          writeStdout(colorRuntimeUiText(event.channel, event.message ?? ""));
          return;
        case "status":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
        case "dispatch":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
        case "tool_call":
          flush();
          renderToolCall(event, state, options, verbosity);
          return;
        case "tool_result":
          flush();
          renderToolResult(event, state, options, verbosity);
          return;
        case "tool_error":
          flush();
          renderToolError(event, state, options);
          return;
        case "foreground_start":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
        case "foreground_message":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
        case "foreground_end":
          flush();
          writeFormattedLine(event, state, options, verbosity);
          return;
      }
    },
  };
}

export function formatRuntimeUiEventLine(event: RuntimeUiEvent, options: RuntimeUiFormatOptions = {}): string {
  const verbosity = normalizeTerminalVerbosity(options.terminalVerbosity);
  const message = formatRuntimeUiEventMessage(event, options, verbosity);
  return formatRuntimeUiEventPlainLine(event, message);
}

export function finishRuntimeUiAssistantOutput(renderer: RuntimeUiTerminalRenderer, trailingNewlines = "\n"): void {
  renderer.flush();
  if (trailingNewlines.length > 0) {
    writeStdout(trailingNewlines);
  }
}

function renderToolCall(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: { cwd?: string; toolArgsMaxChars?: number },
  verbosity: TerminalVerbosity,
): void {
  ensureRenderChannel(state, event.channel);
  const name = event.toolName ?? "tool";
  const display = buildToolCallDisplay(name, event.payload ?? "{}", options.toolArgsMaxChars ?? 160, options.cwd);
  writeSemanticLine("tool", formatRuntimeUiEventMessage(event, options, verbosity));
  if (display.preview && shouldShowToolCallPreview(name, verbosity)) {
    writePreview(event.channel, "content", display.preview, verbosity);
  }
}

function renderToolResult(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: { cwd?: string },
  verbosity: TerminalVerbosity,
): void {
  ensureRenderChannel(state, event.channel);
  const name = event.toolName ?? "tool";
  const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
  const ok = event.ok ?? display.ok !== false;
  if (!ok) {
    const detail = truncateVisiblePreview(display.preview ?? event.message ?? "");
    writeSemanticLine("result", formatRuntimeUiEventMessage(event, options, verbosity, detail), "failed");
  }
  if (display.preview && shouldShowToolResultPreview(name, verbosity)) {
    const compacted = name === "todo_write" ? display.preview : truncateVisiblePreview(display.preview);
    const colored = name === "todo_write" ? colorizeTodoMarkers(compacted) : compacted;
    writePreview(event.channel, "preview", colored, verbosity);
  }
}

function renderToolError(event: RuntimeUiEvent, state: { channel?: RuntimeUiChannel }, options: { cwd?: string }): void {
  ensureRenderChannel(state, event.channel);
  const name = event.toolName ?? "tool";
  const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
  const detail = truncateVisiblePreview(display.preview ?? event.message ?? "");
  writeSemanticLine("result", formatRuntimeUiEventMessage(event, options, "normal", detail), "failed");
}

function writePreview(
  channel: RuntimeUiChannel,
  label: "content" | "preview",
  preview: string,
  verbosity: TerminalVerbosity,
): void {
  if (verbosity === "minimal") {
    writeStdoutLine(colorRuntimeUiText(channel, preview));
    return;
  }
  writeStdoutLine(`${formatRuntimeUiSemanticTag(label)}\n${colorRuntimeUiText(channel, preview)}`);
}

function writeSemanticLine(
  tag: "tool" | "dispatch" | "result",
  message: string,
  state?: "ok" | "failed",
): void {
  const semanticMessage = message.startsWith(`${tag} `) ? message.slice(tag.length + 1) : message;
  writeStdoutLine(`${formatRuntimeUiSemanticTag(tag, state)} ${semanticMessage}`.trimEnd());
}

function writeFormattedLine(
  event: RuntimeUiEvent,
  state: { channel?: RuntimeUiChannel },
  options: RuntimeUiFormatOptions,
  verbosity: TerminalVerbosity,
): void {
  ensureRenderChannel(state, event.channel);
  const message = formatRuntimeUiEventMessage(event, options, verbosity);
  if (event.kind === "dispatch") {
    writeSemanticLine("dispatch", message);
    return;
  }
  writeStdoutLine(colorRuntimeUiText(event.channel, message));
}

function formatRuntimeUiEventMessage(
  event: RuntimeUiEvent,
  options: RuntimeUiFormatOptions,
  verbosity: TerminalVerbosity,
  forcedDetail?: string,
): string {
  switch (event.kind) {
    case "status":
    case "dispatch":
    case "foreground_message":
      return event.message ?? "";
    case "foreground_start":
      return formatRuntimeUiMessage("foreground started", event.executionId);
    case "foreground_end":
      return formatRuntimeUiMessage("foreground ended", event.executionId);
    case "tool_call": {
      const name = event.toolName ?? "tool";
      const display = buildToolCallDisplay(name, event.payload ?? "{}", options.toolArgsMaxChars ?? 160, options.cwd);
      return formatRuntimeUiMessage("tool", display.summary);
    }
    case "tool_result": {
      const name = event.toolName ?? "tool";
      const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
      const ok = event.ok ?? display.ok !== false;
      const status = ok ? "ok" : "failed";
      const tracked = display.tracked ? " tracked" : "";
      const summary = display.summary ? `${display.summary} ${status}${tracked}`.trim() : `${name} ${status}`;
      if (!ok) {
        const detail = forcedDetail ?? truncateVisiblePreview(display.preview ?? event.message ?? "");
        return formatRuntimeUiMessage("result", summary, detail);
      }
      return formatRuntimeUiMessage("result", summary);
    }
    case "tool_error": {
      const name = event.toolName ?? "tool";
      const display = buildToolResultDisplay(name, event.payload ?? event.message ?? "", options.cwd);
      const detail = forcedDetail ?? truncateVisiblePreview(display.preview ?? event.message ?? "");
      return formatRuntimeUiMessage("result", `${name} failed`, detail);
    }
    case "assistant_text":
    case "reasoning":
      return event.message ?? "";
  }
}

function formatRuntimeUiEventPlainLine(event: RuntimeUiEvent, message: string): string {
  switch (event.kind) {
    case "tool_call":
      return `[tool] ${message.replace(/^tool\s+/, "")}`.trimEnd();
    case "tool_result":
      if (!message.includes(" failed")) {
        return "";
      }
      return `[result] ${message.replace(/^result\s+/, "")}`.trimEnd();
    case "tool_error":
      return `[result] ${message.replace(/^result\s+/, "")}`.trimEnd();
    case "dispatch":
      return `[dispatch] ${message}`.trimEnd();
    default:
      return message.trimEnd();
  }
}

function ensureRenderChannel(state: { channel?: RuntimeUiChannel }, channel: RuntimeUiChannel): void {
  if (state.channel === channel) {
    return;
  }
  if (state.channel !== undefined) {
    writeStdout("\n");
  }
  writeStdoutLine(formatRuntimeUiChannelHeader(channel));
  state.channel = channel;
}

function formatRuntimeUiMessage(prefix: string, summary?: string, detail?: string): string {
  const base = [prefix, summary].filter(Boolean).join(" ");
  return detail ? `${base}: ${detail}` : base;
}
