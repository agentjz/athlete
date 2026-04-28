import { createMessage } from "../session/messages.js";
import { persistCheckpointTransition, persistRecoveryTurn } from "./persistence.js";
import type { RuntimePauseTransition, RuntimeRecoverTransition, SessionRecord } from "../../types.js";
import type { RunTurnOptions } from "../types.js";

export async function persistRecoveryOrPauseFromCompaction(input: {
  session: SessionRecord;
  response: {
    content: string | null;
    reasoningContent?: string;
  };
  options: RunTurnOptions;
  transition: RuntimeRecoverTransition | RuntimePauseTransition;
}): Promise<SessionRecord> {
  const appended = await input.options.sessionStore.appendMessages(input.session, [
    createMessage("assistant", input.response.content ?? "", {
      reasoningContent: input.response.reasoningContent,
    }),
  ]);

  if (input.transition.action === "recover") {
    return persistRecoveryTurn(appended, input.options.sessionStore, input.transition);
  }

  return persistCheckpointTransition(appended, input.options.sessionStore, input.transition);
}
