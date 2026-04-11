import { AgentTurnError } from "../agent/errors.js";
import type { SessionStore } from "../agent/session.js";
import { runManagedAgentTurn } from "../agent/turn.js";
import type {
  AcceptanceState,
  RuntimeConfig,
  RuntimeTerminalTransition,
  SessionRecord,
  VerificationState,
} from "../types.js";
import { createStreamRenderer } from "../ui/streamRenderer.js";
import { ui } from "../utils/console.js";

export interface OneShotCloseoutReport {
  sessionId: string;
  completed: boolean;
  unfinishedReason?: string;
  terminalTransition: RuntimeTerminalTransition | null;
  verification: {
    status: string;
    pendingPaths: string[];
    attempts: number;
    reminderCount: number;
    noProgressCount: number;
  };
  acceptance: {
    status: string;
    phase?: string;
    pendingChecks: string[];
    stalledPhaseCount: number;
  };
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
  const streamRenderer = createStreamRenderer(config, {
    cwd,
    assistantLeadingBlankLine: false,
    assistantTrailingNewlines: "\n",
    reasoningLeadingBlankLine: false,
    toolArgsMaxChars: 160,
    toolErrorLabel: "failed, model will try another path",
  });

  try {
    const result = await runManagedAgentTurn({
      input: prompt,
      cwd,
      config,
      session,
      sessionStore,
      callbacks: streamRenderer.callbacks,
      identity: {
        kind: "lead",
        name: "lead",
      },
    });
    if (result.paused && result.pauseReason) {
      ui.warn(result.pauseReason);
    }
    return {
      session: result.session,
      closeout: buildOneShotCloseoutReport(result.session, result.transition ?? null),
    };
  } catch (error) {
    streamRenderer.flush();
    if (error instanceof AgentTurnError) {
      return {
        session: error.session,
        closeout: buildOneShotCloseoutReport(error.session, null, error.message),
      };
    }

    throw error;
  }
}

export function buildOneShotCloseoutReport(
  session: SessionRecord,
  terminalTransition: RuntimeTerminalTransition | null,
  fallbackReason?: string,
): OneShotCloseoutReport {
  const completed = terminalTransition?.action === "finalize";

  return {
    sessionId: session.id,
    completed,
    unfinishedReason: completed ? undefined : terminalTransition?.reason.code ?? fallbackReason ?? "unfinished",
    terminalTransition,
    verification: buildVerificationCloseout(session.verificationState),
    acceptance: buildAcceptanceCloseout(session.acceptanceState),
  };
}

function buildVerificationCloseout(
  state: VerificationState | undefined,
): OneShotCloseoutReport["verification"] {
  return {
    status: state?.status ?? "idle",
    pendingPaths: [...(state?.pendingPaths ?? [])],
    attempts: state?.attempts ?? 0,
    reminderCount: state?.reminderCount ?? 0,
    noProgressCount: state?.noProgressCount ?? 0,
  };
}

function buildAcceptanceCloseout(
  state: AcceptanceState | undefined,
): OneShotCloseoutReport["acceptance"] {
  return {
    status: state?.status ?? "idle",
    phase: state?.currentPhase,
    pendingChecks: [...(state?.pendingChecks ?? [])],
    stalledPhaseCount: state?.stalledPhaseCount ?? 0,
  };
}
