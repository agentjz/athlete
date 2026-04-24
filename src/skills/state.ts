import { isInternalMessage } from "../agent/session.js";
import type { SessionRecord, StoredMessage, ToolExecutionResult } from "../types.js";
import { selectSkillsForTurn } from "./matching.js";
import { readLoadedSkillName } from "./loading.js";
import type { LoadedSkill, SkillIdentity, SkillRuntimeState } from "./types.js";

export function buildSkillRuntimeState(options: {
  skills: LoadedSkill[];
  session: Pick<SessionRecord, "messages" | "taskState">;
  input?: string;
  identity: SkillIdentity;
  objective?: string;
  taskSummary?: string;
  availableToolNames: string[];
}): SkillRuntimeState {
  const loadedSkillNames = getLoadedSkillNames(options.session.messages);
  const selection = selectSkillsForTurn({
    skills: options.skills,
    input: options.input ?? findLatestUserText(options.session.messages),
    identity: options.identity,
    objective: options.objective ?? options.session.taskState?.objective,
    taskSummary: options.taskSummary,
    availableToolNames: options.availableToolNames,
    loadedSkillNames,
  });

  return {
    ...selection,
    loadedSkillNames,
  };
}

export function getSkillToolGateResult(
  toolName: string,
  runtimeState: SkillRuntimeState,
): ToolExecutionResult | null {
  if (toolName === "load_skill" || runtimeState.missingRequiredSkills.length === 0) {
    return null;
  }

  const missingNames = runtimeState.missingRequiredSkills.map((skill) => skill.name);
  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        error: "Required skill(s) not loaded.",
        code: "SKILL_REQUIRED",
        missing: missingNames,
        hint: `Call load_skill for: ${missingNames.join(", ")}`,
        suggestedTool: "load_skill",
      },
      null,
      2,
    ),
  };
}

export function getLoadedSkillNames(messages: StoredMessage[]): Set<string> {
  const loaded = new Set<string>();

  for (const message of messages) {
    if (message?.role !== "tool" || message.name !== "load_skill") {
      continue;
    }

    const loadedName = readLoadedSkillName(message.content);
    if (loadedName) {
      loaded.add(loadedName);
    }
  }

  return loaded;
}

export function formatMissingRequiredSkillReminder(runtimeState: SkillRuntimeState): string {
  return runtimeState.missingRequiredSkills.map((skill) => skill.name).join(", ");
}

function findLatestUserText(messages: StoredMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || !message.content || isInternalMessage(message.content)) {
      continue;
    }

    return message.content;
  }

  return "";
}
