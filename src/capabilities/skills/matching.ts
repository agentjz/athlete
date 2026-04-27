import type {
  LoadedSkill,
  SkillMatchReason,
  SkillSelectionInput,
  SkillSelectionResult,
} from "./types.js";

export function selectSkillsForTurn(input: SkillSelectionInput): SkillSelectionResult {
  const availableToolNames = new Set(input.availableToolNames.map((name) => name.toLowerCase()));
  const loadedSkillNames = input.loadedSkillNames ?? new Set<string>();
  const combinedText = normalizeText([input.input, input.objective, input.taskSummary]);
  const taskText = normalizeText([input.objective, input.taskSummary]);

  const matches = input.skills.map((skill) => {
    const blockedBy: SkillSelectionResult["matches"][number]["blockedBy"] = [];
    const matchedBy: SkillMatchReason[] = [];
    const named = combinedText.includes(skill.name.toLowerCase());
    const loaded = loadedSkillNames.has(skill.name);

    if (skill.agentKinds.length > 0 && !skill.agentKinds.includes(input.identity.kind)) {
      blockedBy.push("agent_kind");
    }

    if (
      skill.roles.length > 0 &&
      (!input.identity.role || !skill.roles.includes(input.identity.role.toLowerCase()))
    ) {
      blockedBy.push("role");
    }

    if (!hasAllTools(availableToolNames, skill.tools.required)) {
      blockedBy.push("required_tools");
    }

    if (hasAnyTools(availableToolNames, skill.tools.incompatible)) {
      blockedBy.push("incompatible_tools");
    }

    const taskMatched = matchesAny(taskText, skill.taskTypes);
    if (skill.taskTypes.length > 0) {
      if (taskMatched) {
        matchedBy.push("task_type");
      } else {
        blockedBy.push("task_type");
      }
    }

    const sceneMatched = matchesAny(combinedText, skill.scenes);
    if (skill.scenes.length > 0) {
      if (sceneMatched) {
        matchedBy.push("scene");
      } else {
        blockedBy.push("scene");
      }
    }

    const triggerMatched = matchesTriggers(combinedText, skill);
    if (skill.triggers.keywords.length > 0 || skill.triggers.patterns.length > 0) {
      if (triggerMatched) {
        matchedBy.push("trigger");
      } else if (!named) {
        blockedBy.push("trigger");
      }
    }

    if (named) {
      matchedBy.push("name");
    } else if (matchedBy.length === 0) {
      matchedBy.push("default");
    }

    return {
      skill,
      applicable: blockedBy.length === 0 && skill.loadMode !== "manual",
      named,
      loaded,
      blockedBy: uniqueList(blockedBy),
      matchedBy: uniqueList(matchedBy),
    };
  });

  const namedSkills = matches
    .filter((match) => match.named && match.blockedBy.length === 0)
    .map((match) => match.skill);
  const applicableSkills = matches.filter((match) => match.applicable).map((match) => match.skill);
  const suggestedSkills = applicableSkills.filter((skill) => skill.loadMode === "suggested");
  const requiredSkills = applicableSkills.filter((skill) => skill.loadMode === "required");
  const loadedSkills = matches.filter((match) => match.loaded).map((match) => match.skill);
  const missingRequiredSkills = requiredSkills.filter((skill) => !loadedSkillNames.has(skill.name));

  return {
    matches,
    namedSkills,
    applicableSkills,
    suggestedSkills,
    requiredSkills,
    missingRequiredSkills,
    loadedSkills,
  };
}

function normalizeText(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

function hasAllTools(availableToolNames: Set<string>, requiredTools: string[]): boolean {
  return requiredTools.every((tool) => availableToolNames.has(tool));
}

function hasAnyTools(availableToolNames: Set<string>, tools: string[]): boolean {
  return tools.some((tool) => availableToolNames.has(tool));
}

function matchesAny(text: string, values: string[]): boolean {
  return values.some((value) => value && text.includes(value));
}

function matchesTriggers(text: string, skill: LoadedSkill): boolean {
  if (matchesAny(text, skill.triggers.keywords)) {
    return true;
  }

  return skill.triggers.patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(text);
    } catch {
      return false;
    }
  });
}

function uniqueList<T>(values: T[]): T[] {
  return [...new Set(values)];
}
