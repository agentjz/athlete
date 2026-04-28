import { evaluateAcceptanceState } from "../acceptance.js";
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
  return options.sessionStore.save(evaluation.session);
}
