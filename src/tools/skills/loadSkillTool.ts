import { createLoadedSkillToolResult } from "../../skills/loading.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const loadSkillTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "load_skill",
      description: "Load the full content of a project skill from SKILL.md when a specialized workflow is relevant.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill name. Use a value from the available project skills list.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name").trim();
    const skill = context.projectContext.skills.find((item) => item.name === name);

    if (!skill) {
      const available = context.projectContext.skills.map((item) => item.name);
      throw new Error(
        available.length > 0
          ? `Unknown skill "${name}". Available skills: ${available.join(", ")}`
          : `Unknown skill "${name}". No project skills are available.`,
      );
    }

    return okResult(createLoadedSkillToolResult(skill));
  },
};
