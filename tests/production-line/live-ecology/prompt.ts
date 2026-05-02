import {
  getDisabledToolReasons,
  getDisabledTools,
  getEnabledTools,
  type LiveEcologyGroup,
} from "./groups.ts";

export function buildLiveEcologyPrompt(group: LiveEcologyGroup, groupDir: string, toolNames: string[]): string {
  const skipped = getSkippedTools(group);
  const activeTools = toolNames.filter((name) => !skipped.includes(name));
  const expected = getExpectedTools(group);
  const skipReasons = getDisabledToolReasons(group);

  return [
    `This is a real API ecology test for ${group.title}.`,
    `The test directory is ${groupDir}.`,
    `Registered tool inventory: ${toolNames.join(", ")}.`,
    `Tools that this group should cover: ${expected.join(", ")}.`,
    skipped.length > 0 ? `Tools explicitly skipped in this group: ${skipped.join(", ")}.` : "",
    Object.keys(skipReasons).length > 0 ? `Skip reasons: ${Object.entries(skipReasons).map(([tool, reason]) => `${tool}=${reason}`).join("; ")}.` : "",
    `Except for explicitly skipped tools, call only these registered tools: ${activeTools.join(", ")}.`,
    "Before any tool smoke-test work, explicitly state the model identity and test mode in Simplified Chinese. First inspect or infer the active model/provider from the available runtime/config evidence; if exact identity is unavailable, state unknown instead of guessing.",
    group.promptLines.join(" ").replaceAll("__RUN_DIR__", groupDir),
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
