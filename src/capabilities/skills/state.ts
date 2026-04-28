import type { SessionRecord, StoredMessage } from "../../types.js";
import { readLoadedSkillName } from "./loading.js";
import type { LoadedSkill, SkillRuntimeState } from "./types.js";

export function buildSkillRuntimeState(options: {
  skills: LoadedSkill[];
  session: Pick<SessionRecord, "messages" | "taskState">;
}): SkillRuntimeState {
  const loadedSkillNames = getLoadedSkillNames(options.session.messages);

  return {
    loadedSkills: options.skills.filter((skill) => loadedSkillNames.has(skill.name)),
    loadedSkillNames,
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
