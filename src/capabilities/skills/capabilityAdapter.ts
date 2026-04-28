import { createCapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import type { LoadedSkill } from "./types.js";

export function listSkillCapabilityPackages(skills: readonly LoadedSkill[]): CapabilityPackage[] {
  return skills.map((skill) => {
    const profile = createCapabilityProfile({
      kind: "skill",
      id: `skill.${skill.name}`,
      name: skill.name,
      description: skill.description || `Project skill ${skill.name}`,
      bestFor: [
        ...skill.taskTypes.map((item) => `task:${item}`),
        ...skill.scenes.map((item) => `scene:${item}`),
        ...skill.triggers.keywords.slice(0, 5).map((item) => `keyword:${item}`),
      ],
      notFor: ["automatic route changes", "bypassing explicit load_skill", "machine-owned strategy"],
      inputSchema: "AssignmentContract plus explicit load_skill when Lead chooses the skill",
      outputSchema: "CloseoutContract through the tool or execution path that uses the skill",
      budgetPolicy: "Load only when Lead judges the skill relevant.",
      tools: [...skill.tools.required, ...skill.tools.optional],
      cost: "low",
      extensionPoint: skill.path,
    });

    return createCapabilityPackage({
      packageId: profile.id,
      profile,
      source: {
        kind: "skill",
        id: profile.id,
        path: skill.path,
        builtIn: false,
      },
      adapter: {
        kind: "skill",
        id: `${profile.id}.adapter`,
        description: "Adapts a discovered skill into the generic capability package contract.",
      },
      runnerType: "skill_load",
      runner: {
        createsExecution: false,
        emitsWakeSignal: false,
      },
      availability: skill.description || `Skill body available through explicit load_skill: ${skill.name}.`,
    });
  });
}
