import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import { createWaitingSpinner, wrapCallbacksWithSpinnerStop } from "../../ui/spinner.js";
import { createStreamRenderer } from "../../ui/streamRenderer.js";

export function createCliTurnDisplay(options: {
  cwd: string;
  config: {
    showReasoning: boolean;
  };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  const streamRenderer = createStreamRenderer(options.config, {
    cwd: options.cwd,
    assistantLeadingBlankLine: true,
    assistantTrailingNewlines: "\n\n",
    reasoningLeadingBlankLine: true,
    toolArgsMaxChars: 200,
    toolErrorLabel: "failed, retrying via model",
    abortSignal: options.abortSignal,
  });
  const waitingSpinner = createWaitingSpinner({ label: "thinking" });
  const callbacks = wrapCallbacksWithSpinnerStop(streamRenderer.callbacks, () => {
    waitingSpinner.stop();
  });

  callbacks.onModelWaitStart = () => {
    waitingSpinner.start();
  };
  callbacks.onModelWaitStop = () => {
    waitingSpinner.stop();
  };

  return {
    callbacks,
    flush() {
      waitingSpinner.stop();
      streamRenderer.flush();
    },
    dispose() {
      waitingSpinner.stop();
    },
  };
}
