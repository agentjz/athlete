import {
  getDisabledToolReasons,
  getDisabledTools,
  getEnabledTools,
  type LiveEcologyGroup,
} from "./groups.ts";
import { buildToolLedgerPrompt } from "./toolLedger.ts";

interface LiveEcologyPromptOptions {
  targetTool?: string;
}

export function buildLiveEcologyPrompt(
  group: LiveEcologyGroup,
  groupDir: string,
  toolNames: string[],
  options: LiveEcologyPromptOptions = {},
): string {
  const skipped = getSkippedTools(group);
  const activeTools = toolNames.filter((name) => !skipped.includes(name));
  const expected = options.targetTool ? [options.targetTool] : getExpectedTools(group);
  const skipReasons = getDisabledToolReasons(group);

  const taskInstructions = options.targetTool
    ? [
        `Run one focused live ecology case for target tool ${options.targetTool}.`,
        "Call the target tool at least once. Use minimal prerequisite/helper tools only when the target tool needs setup evidence or an id from another runtime object.",
        `All generated evidence must stay inside ${groupDir}. Never delete the test directory and never modify Real World project source.`,
        "If the target tool cannot be validly called because no prerequisite object exists and no safe prerequisite can be created, mark the target as failed with failureClass=model_invocation_mistake and explain the missing prerequisite in Simplified Chinese.",
      ].join(" ")
    : group.promptLines.join(" ").replaceAll("__RUN_DIR__", groupDir);

  return [
    `This is a real API ecology test for ${group.title}.`,
    `The test directory is ${groupDir}.`,
    `Registered tool inventory: ${toolNames.join(", ")}.`,
    options.targetTool
      ? `This machine-scheduled case must cover exactly this target tool: ${options.targetTool}.`
      : `Tools that this group must cover: ${expected.join(", ")}.`,
    skipped.length > 0 ? `Tools explicitly skipped in this group: ${skipped.join(", ")}.` : "",
    Object.keys(skipReasons).length > 0 ? `Skip reasons: ${Object.entries(skipReasons).map(([tool, reason]) => `${tool}=${reason}`).join("; ")}.` : "",
    `Except for explicitly skipped tools, call only these registered tools: ${activeTools.join(", ")}.`,
    "Before any tool smoke-test work, explicitly state the model identity and test mode in Simplified Chinese. First inspect or infer the active model/provider from the available runtime/config evidence; if exact identity is unavailable, state unknown instead of guessing.",
    buildToolLedgerPrompt(groupDir, expected),
    taskInstructions,
    "All todo text, reports, final summaries, and user-visible conclusions must be written in Simplified Chinese.",
    "Separate two failure classes: model invocation mistakes and real tool execution failures. Do not report an uncalled tool as passed.",
  ].filter(Boolean).join(" ");
}

export function getExpectedTools(group: LiveEcologyGroup): string[] {
  return [...new Set(getEnabledTools(group))].sort();
}

export function getSkippedTools(group: LiveEcologyGroup): string[] {
  return [...new Set(getDisabledTools(group))].sort();
}
