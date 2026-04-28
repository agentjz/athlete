import { noteCheckpointCompleted } from "../checkpoint.js";
import { createMessage } from "../session/messages.js";
import {
  buildRunTurnResult,
  createEmptyAssistantResponseTransition,
  createFinalizeTransition,
} from "../runtimeTransition.js";
import { persistCheckpointTransition } from "./persistence.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";
import type { AcceptanceState, RuntimeContinueTransition, SessionRecord, VerificationState } from "../../types.js";

interface HandleCompletedAssistantResponseParams {
  session: SessionRecord;
  response: AssistantResponse;
  identity: AgentIdentity;
  changedPaths: Set<string>;
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  options: RunTurnOptions;
}

export async function handleCompletedAssistantResponse(
  params: HandleCompletedAssistantResponseParams,
): Promise<
  | {
      kind: "continue";
      session: SessionRecord;
      transition: RuntimeContinueTransition;
    }
  | {
      kind: "return";
      result: RunTurnResult;
    }
> {
  void params.identity;
  void params.acceptanceState;

  const assistantMessage = createMessage("assistant", params.response.content ?? "", {
    reasoningContent: params.response.reasoningContent,
  });
  const validationAttempted = (params.verificationState?.attempts ?? 0) > 0;
  const validationPassed = params.verificationState?.status === "passed";

  if (!hasVisibleAssistantResult(params.response.content)) {
    const transition = createEmptyAssistantResponseTransition();
    const session = await persistCheckpointTransition(
      await params.options.sessionStore.appendMessages(params.session, [assistantMessage]),
      params.options.sessionStore,
      transition,
    );
    params.options.callbacks?.onStatus?.("Assistant returned no visible result. Continuing the same objective.");
    return {
      kind: "continue",
      session,
      transition,
    };
  }

  const transition = createFinalizeTransition({
    changedPaths: params.changedPaths,
    verificationState: params.session.verificationState,
  });
  const session = await params.options.sessionStore.save(
    noteCheckpointCompleted(
      await params.options.sessionStore.appendMessages(params.session, [assistantMessage]),
      transition,
    ),
  );
  return {
    kind: "return",
    result: buildRunTurnResult({
      session,
      changedPaths: params.changedPaths,
      verificationAttempted: validationAttempted,
      verificationPassed: validationPassed,
      transition,
    }),
  };
}

export function emitAssistantReasoning(response: AssistantResponse, options: RunTurnOptions): void {
  if (response.reasoningContent && options.config.showReasoning && !response.streamedReasoningContent) {
    options.callbacks?.onReasoning?.(response.reasoningContent);
  }
}

export function emitAssistantFinalOutput(response: AssistantResponse, options: RunTurnOptions): void {
  if (response.content && !response.streamedAssistantContent) {
    options.callbacks?.onAssistantText?.(response.content);
  }

  if (response.content) {
    options.callbacks?.onAssistantDone?.(response.content);
  }
}

function hasVisibleAssistantResult(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().length > 0;
}
