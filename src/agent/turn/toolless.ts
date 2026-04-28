import { handleCompletedAssistantResponse } from "./finalize.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";
import type { RuntimeContinueTransition, SessionRecord } from "../../types.js";

interface ResolveToollessTurnParams {
  session: SessionRecord;
  response: AssistantResponse;
  identity: AgentIdentity;
  changedPaths: Set<string>;
  options: RunTurnOptions;
}

export async function resolveToollessTurn(
  params: ResolveToollessTurnParams,
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
  return handleCompletedAssistantResponse({
    session: params.session,
    response: params.response,
    identity: params.identity,
    changedPaths: params.changedPaths,
    verificationState: params.session.verificationState,
    acceptanceState: params.session.acceptanceState,
    options: params.options,
  });
}
