import type { SessionStore } from "../agent/session.js";
import { runHostTurn } from "../host/turn.js";
import type {
  RuntimeConfig,
  RuntimeTerminalTransition,
  SessionRecord,
} from "../types.js";
import { createRuntimeUiAgentCallbacks } from "../runtime-ui/agentCallbacks.js";
import { ui } from "../utils/console.js";

export interface OneShotCloseoutReport {
  sessionId: string;
  completed: boolean;
  unfinishedReason?: string;
  terminalTransition: RuntimeTerminalTransition | null;
}

export interface OneShotPromptRunResult {
  session: SessionRecord;
  closeout: OneShotCloseoutReport;
}

export async function runOneShotPrompt(
  prompt: string,
  cwd: string,
  config: RuntimeConfig,
  session: SessionRecord,
  sessionStore: SessionStore,
): Promise<OneShotPromptRunResult> {
  const runtimeUi = createRuntimeUiAgentCallbacks({
    channel: "lead",
    config,
    cwd,
    assistantLeadingBlankLine: false,
    assistantTrailingNewlines: "\n",
    reasoningLeadingBlankLine: false,
    toolArgsMaxChars: 160,
  });

  const outcome = await runHostTurn({
    host: "cli",
    input: prompt,
    cwd,
    config,
    session,
    sessionStore,
    callbacks: runtimeUi.callbacks,
  });

  if (outcome.status === "failed" || outcome.status === "aborted") {
    runtimeUi.flush();
  }

  if (outcome.status === "paused" && outcome.pauseReason) {
    ui.warn(outcome.pauseReason);
  }

  return {
    session: outcome.session,
    closeout: buildOneShotCloseoutReport(
      outcome.session,
      outcome.result?.transition ?? null,
      outcome.status === "failed" || outcome.status === "aborted" ? outcome.errorMessage : undefined,
    ),
  };
}

export function buildOneShotCloseoutReport(
  session: SessionRecord,
  terminalTransition: RuntimeTerminalTransition | null,
  defaultUnfinishedReason?: string,
): OneShotCloseoutReport {
  const completed = terminalTransition?.action === "finalize";

  return {
    sessionId: session.id,
    completed,
    unfinishedReason: completed ? undefined : terminalTransition?.reason.code ?? defaultUnfinishedReason ?? "unfinished",
    terminalTransition,
  };
}
