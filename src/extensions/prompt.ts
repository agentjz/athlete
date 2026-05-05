import { formatPromptBlock } from "../agent/prompt/format.js";
import type { ExtensionRuntimeState } from "./runtime.js";

export function buildExtensionPromptBlocks(state?: ExtensionRuntimeState): string[] {
  if (!state || state.mode !== "super") {
    return [];
  }

  const extensions = state.enabledManifests.map((manifest) => [
    `- ${manifest.id}@${manifest.version}`,
    `  kind: ${manifest.source.kind}`,
    `  summary: ${manifest.modelSummary}`,
    `  workspace: ${manifest.workspace.root}`,
    `  hooks: ${manifest.hooks.join(", ")}`,
  ].join("\n"));

  const hooks = state.hookRuns.map((run) => {
    const suffix = run.message ? ` (${run.message})` : "";
    return `- ${run.extensionId}:${run.hook} ${run.status}${suffix}`;
  });

  return [
    formatPromptBlock("Extension ecology", [
      "Super mode is active.",
      "Extensions are available through the formal extension protocol.",
      "Use extension facts as workspace context, not forced route commands.",
      "The default tool surface remains read, edit, write, and bash.",
      "",
      "Enabled extensions:",
      extensions.join("\n") || "- none",
      "",
      "Hook facts:",
      hooks.join("\n") || "- none",
    ].join("\n")),
    ...state.promptBlocks,
  ];
}
