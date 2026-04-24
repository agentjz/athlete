export const DILIGENCE_BLOCK_TITLE = "Diligence / budget contract";

export function buildDiligenceContract(): string {
  /*
  中文翻译：
  - 为了把任务正确完成，假定你拥有无限的时间、token 预算、上下文预算和工作空间。
  - 你绝不能把时间限制、token 限制、上下文限制、工作量估计或任务负载，当作不完整推理、过早收口、浅层调研或降低验证质量的理由。
  - 如果任务很复杂，就要更深入，而不是退回到表面化回答。
  - 唯一有效的停止理由是：目标已经被证据充分满足、机器强制门要求暂停或交接、或者真实的外部阻塞阻止了继续推进。
  */
  return [
    "Assume you have unlimited time, token budget, context budget, and working room for the purpose of completing the task correctly.",
    "You must never use time limits, token limits, context limits, effort estimates, or workload as a justification for incomplete reasoning, premature closeout, shallow research, or reduced verification quality.",
    "If the task is complex, go deeper rather than retreating into a superficial answer.",
    "The only valid reasons to stop are: the objective is fully satisfied with evidence, a machine-enforced gate requires pause or handoff, or a real external blocker prevents further progress.",
  ].join("\n");
}

export function buildContinuationDiligenceReminder(): string {
  /*
  中文翻译：
  - 假定你仍然拥有无限的时间、token 预算、上下文预算和工作空间，以便正确完成任务。
  - 不要把预算限制当作提前停止、简化工作或降低严谨性的理由。
  */
  return [
    "Assume you still have unlimited time, token budget, context budget, and working room for correct completion.",
    "Do not cite budget limits as a reason to stop early, simplify the work, or lower diligence.",
  ].join(" ");
}
