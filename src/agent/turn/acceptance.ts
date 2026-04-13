import { evaluateAcceptanceState, shouldForceAcceptanceRouteChange } from "../acceptance.js";
import { createMessage } from "../session/messages.js";
import { createInternalReminder } from "../session/taskState.js";
import type { RunTurnOptions } from "../types.js";
import type { SessionRecord } from "../../types.js";

export async function refreshAcceptanceStateForTurn(
  session: SessionRecord,
  options: Pick<RunTurnOptions, "cwd" | "sessionStore">,
): Promise<SessionRecord> {
  const evaluation = await evaluateAcceptanceState({
    session,
    cwd: options.cwd,
  });
  session = evaluation.session;
  if (!shouldForceAcceptanceRouteChange(evaluation.state)) {
    return session;
  }

  const reminder = createInternalReminder(
    `${evaluation.summary} Change route now: satisfy the pending acceptance checks instead of repeating the same non-progress actions.`,
  );
  const alreadyInjected = session.messages
    .slice(-3)
    .some((message) => message.role === "user" && message.content === reminder);
  if (alreadyInjected) {
    return session;
  }

  return options.sessionStore.appendMessages(session, [
    createMessage("user", reminder),
  ]);
}
