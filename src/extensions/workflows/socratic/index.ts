import { formatPromptBlock } from "../../../agent/prompt/format.js";
import { createEmptyHookOutput, type ExtensionProvider } from "../../protocol/index.js";
import { SOCRATIC_MANIFEST } from "./manifest.js";
import { ensureSocraticWorkspace, resolveSocraticWorkspace } from "./workspace.js";

export const socraticWorkflowProvider: ExtensionProvider = {
  sourceId: "workflow:socratic",
  listExtensions() {
    return [{
      extension: {
        manifest: SOCRATIC_MANIFEST,
        async runHook(hook, context) {
          if (hook === "super.start") {
            await ensureSocraticWorkspace(context.cwd, SOCRATIC_MANIFEST, context.sessionId);
            return createEmptyHookOutput();
          }

          if (hook === "prompt.runtime") {
            const workspace = resolveSocraticWorkspace(context.cwd, SOCRATIC_MANIFEST, context.sessionId);
            return {
              promptBlocks: [
                formatPromptBlock("Socratic workflow", [
                  "Socratic workflow is enabled.",
                  "Help the user learn from the material in this workspace.",
                  "Search and read only the useful parts. Do not load everything at once.",
                  "Answer from the material first. If you add your own explanation, keep it distinct from material facts.",
                  "After each learning exchange, decide what should be updated: goals, questions, frictions, preferences, index, or session memory.",
                  "Only write formal notes when the user naturally asks you to keep, record, remember, or save an understanding.",
                  "Ask, explain, correct, and record with judgment. Do not turn this into a rigid checklist.",
                  "",
                  `Workspace: ${workspace.root}`,
                  `Material: ${workspace.material}`,
                  `Goals: ${workspace.goals}`,
                  `Questions: ${workspace.questions}`,
                  `Frictions: ${workspace.frictions}`,
                  `Preferences: ${workspace.preferences}`,
                  `Notes: ${workspace.notes}`,
                  `Index: ${workspace.index}`,
                  `Sessions: ${workspace.sessions}`,
                ].join("\n")),
              ],
              facts: {
                workspaceRoot: workspace.root,
                material: workspace.material,
                goals: workspace.goals,
                questions: workspace.questions,
                frictions: workspace.frictions,
                preferences: workspace.preferences,
                notes: workspace.notes,
                index: workspace.index,
                sessions: workspace.sessions,
              },
            };
          }

          return createEmptyHookOutput();
        },
      },
      enabled: true,
      manifestPath: "src/extensions/workflows/socratic/manifest.ts",
    }];
  },
};
