import { createMessage } from "../session/messages.js";
import { createInternalReminder } from "../session/taskState.js";
import { createMissingSkillTransition } from "../runtimeTransition.js";
import { handleCompletedAssistantResponse } from "./finalize.js";
import { persistCheckpointTransition } from "./persistence.js";
import { formatMissingRequiredSkillReminder } from "../../skills/state.js";
import type { SkillRuntimeState } from "../../types.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";
import type { RuntimeContinueTransition, SessionRecord } from "../../types.js";

interface ResolveToollessTurnParams {
  session: SessionRecord;
  response: AssistantResponse;
  identity: AgentIdentity;
  changedPaths: Set<string>;
  hadIncompleteTodosAtStart: boolean;
  hasSubstantiveToolActivity: boolean;
  validationReminderInjected: boolean;
  skillRuntimeState: SkillRuntimeState;
  options: RunTurnOptions;
}

export async function resolveToollessTurn(
  params: ResolveToollessTurnParams,
): Promise<
  | {
      kind: "continue";
      session: SessionRecord;
      validationReminderInjected: boolean;
      transition: RuntimeContinueTransition;
    }
  | {
      kind: "return";
      result: RunTurnResult;
    }
> {
  if (params.skillRuntimeState.missingRequiredSkills.length > 0) {
    const missingSkillNames = formatMissingRequiredSkillReminder(params.skillRuntimeState);
    const transition = createMissingSkillTransition(
      params.skillRuntimeState.missingRequiredSkills.map((skill) => skill.name),
    );
    const session = await persistCheckpointTransition(
      await params.options.sessionStore.appendMessages(params.session, [
        createMessage("assistant", params.response.content ?? "", {
          reasoningContent: params.response.reasoningContent,
        }),
        createMessage(
          "user",
          createInternalReminder(
            `Required skill(s) not loaded: ${missingSkillNames}. ` +
              "Use load_skill for the missing skills before continuing.",
          ),
        ),
      ]),
      params.options.sessionStore,
      transition,
    );
    params.options.callbacks?.onStatus?.("Required skill missing. Asking the model to load it...");
    return {
      kind: "continue",
      session,
      validationReminderInjected: params.validationReminderInjected,
      transition,
    };
  }

  return handleCompletedAssistantResponse({
    session: params.session,
    response: params.response,
    identity: params.identity,
    changedPaths: params.changedPaths,
    hadIncompleteTodosAtStart: params.hadIncompleteTodosAtStart,
    hasSubstantiveToolActivity: params.hasSubstantiveToolActivity,
    verificationState: params.session.verificationState,
    validationReminderInjected: params.validationReminderInjected,
    options: params.options,
  });
}
