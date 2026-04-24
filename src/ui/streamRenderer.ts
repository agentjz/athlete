import type { AgentCallbacks } from "../agent/types.js";
import type { RuntimeConfig } from "../types.js";
import { ui } from "../utils/console.js";
import { writeStdout } from "../utils/stdio.js";
import { colorizeTodoMarkers } from "./todoStyling.js";
import {
  compactHighNoisePreview,
  emitPreview,
  normalizeTerminalVerbosity,
  shouldClampReadContentPreview,
  shouldCompactPreview,
  shouldShowToolCallPreview,
  shouldShowToolResultPreview,
  truncateVisiblePreview,
  type TerminalVerbosity,
} from "./streamRenderer/previewPolicy.js";
import {
  buildToolCallDisplay,
  buildToolResultDisplay,
} from "./streamRenderer/toolDisplay.js";

interface StreamRendererOptions {
  cwd?: string;
  assistantLeadingBlankLine?: boolean;
  assistantTrailingNewlines?: string;
  reasoningLeadingBlankLine?: boolean;
  toolArgsMaxChars?: number;
  toolErrorLabel: string;
  abortSignal?: AbortSignal;
}

interface StreamState {
  assistantOpen: boolean;
  reasoningOpen: boolean;
}

export interface StreamRenderer {
  callbacks: AgentCallbacks;
  flush: () => void;
}

export function createStreamRenderer(
  config: Pick<RuntimeConfig, "showReasoning"> & { terminalVerbosity?: TerminalVerbosity },
  options: StreamRendererOptions,
): StreamRenderer {
  const terminalVerbosity = normalizeTerminalVerbosity(config.terminalVerbosity);
  let aborted = false;
  const isAborted = (): boolean => aborted || options.abortSignal?.aborted === true;

  const state: StreamState = {
    assistantOpen: false,
    reasoningOpen: false,
  };
  const flush = (): void => {
    if (!state.reasoningOpen && !state.assistantOpen) {
      return;
    }

    writeStdout("\n");
    state.reasoningOpen = false;
    state.assistantOpen = false;
  };

  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", () => {
      if (aborted) {
        return;
      }
      aborted = true;
      flush();
    });
  }

  const beginReasoning = (): void => {
    if (!config.showReasoning) {
      return;
    }

    if (!state.reasoningOpen) {
      writeStdout(options.reasoningLeadingBlankLine ? "\n[reasoning]\n" : "[reasoning]\n");
      state.reasoningOpen = true;
    }
  };

  const beginAssistant = (): void => {
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

  return {
    flush,
    callbacks: {
      onReasoningDelta(delta) {
        if (isAborted()) {
          return;
        }

        if (!config.showReasoning) {
          return;
        }

        beginReasoning();
        writeStdout(delta);
      },
      onReasoning(text) {
        if (isAborted()) {
          return;
        }

        if (!config.showReasoning) {
          return;
        }

        beginReasoning();
        writeStdout(`${text}\n`);
        state.reasoningOpen = false;
      },
      onAssistantDelta(delta) {
        if (isAborted()) {
          return;
        }

        beginAssistant();
        writeStdout(delta);
      },
      onAssistantStage(text) {
        if (isAborted()) {
          return;
        }

        beginAssistant();
        writeStdout(text);
      },
      onAssistantText(text) {
        if (isAborted()) {
          return;
        }

        beginAssistant();
        writeStdout(text);
      },
      onAssistantDone() {
        if (isAborted()) {
          return;
        }

        if (state.reasoningOpen) {
          writeStdout("\n");
          state.reasoningOpen = false;
        }

        if (state.assistantOpen) {
          writeStdout(options.assistantTrailingNewlines ?? "\n");
          state.assistantOpen = false;
        }
      },
      onToolCall(name, args) {
        if (isAborted()) {
          return;
        }

        flush();
        const display = buildToolCallDisplay(name, args, options.toolArgsMaxChars ?? 160, options.cwd);
        ui.tool(display.summary);
        if (display.preview && shouldShowToolCallPreview(name, terminalVerbosity)) {
          emitPreview("content", display.preview, terminalVerbosity);
        }
      },
      onToolResult(name, output) {
        if (isAborted()) {
          return;
        }

        flush();
        const display = buildToolResultDisplay(name, output, options.cwd);
        if (display.summary) {
          ui.dim(terminalVerbosity === "minimal" ? display.summary : `[result] ${display.summary}`);
        }
        if (display.preview && shouldShowToolResultPreview(name, terminalVerbosity)) {
          const preview = shouldClampReadContentPreview(name)
            ? truncateVisiblePreview(display.preview)
            : display.preview;
          const compactedPreview = shouldCompactPreview(name)
            ? compactHighNoisePreview(preview)
            : preview;
          const coloredPreview = name === "todo_write"
            ? colorizeTodoMarkers(compactedPreview)
            : compactedPreview;
          emitPreview("preview", coloredPreview, terminalVerbosity);
        }
      },
      onToolError(name, error) {
        if (isAborted()) {
          return;
        }

        flush();
        ui.warn(`${name} ${options.toolErrorLabel}`);
        ui.dim(error.length <= 600 ? error : `${error.slice(0, 600)}...`);
      },
      onStatus(text) {
        if (isAborted()) {
          return;
        }

        flush();
        ui.dim(text);
      },
    },
  };
}
