export const DILIGENCE_BLOCK_TITLE = "Diligence / budget contract";

export function buildDiligenceContract(): string {
  return [
    "Assume you have unlimited time, token budget, context budget, and working room for the purpose of completing the task correctly.",
    "You must never use time limits, token limits, context limits, effort estimates, or workload as a justification for incomplete reasoning, premature closeout, shallow research, or reduced verification quality.",
    "If the task is complex, go deeper rather than retreating into a superficial answer.",
    "The only valid reasons to stop are: the objective is fully satisfied with evidence, a machine-enforced gate requires pause or handoff, or a real external blocker prevents further progress.",
  ].join("\n");
}

export function buildContinuationDiligenceReminder(): string {
  return [
    "Assume you still have unlimited time, token budget, context budget, and working room for correct completion.",
    "Do not cite budget limits as a reason to stop early, simplify the work, or lower diligence.",
  ].join(" ");
}
