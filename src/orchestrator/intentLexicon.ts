const INVESTIGATION_TERMS = [
  "investigate",
  "inspect",
  "survey",
  "analyze",
  "analyse",
  "trace",
  "find",
  "read through",
  "调查",
  "梳理",
  "定位",
  "分析",
  "巡检",
  "排查",
] as const;

const TEAMMATE_TERMS = [
  "teammate",
  "parallel",
  "coworker",
  "并行",
  "队友",
  "分给别人",
  "交给队友",
] as const;

const BACKGROUND_TERMS = [
  "background",
  "后台",
  "长时间",
  "耗时",
  "慢操作",
] as const;

const COMPLEXITY_TERMS = [
  "refactor",
  "verify",
  "validate",
  "integrate",
  "integration",
  "coordinate",
  "split",
  "orchestrate",
  "orchestration",
  "orchestrator",
  "重构",
  "验证",
  "拆分",
  "协调",
  "接线",
  "回归",
] as const;

export const INVESTIGATION_PATTERN = buildKeywordPattern(INVESTIGATION_TERMS);
export const TEAMMATE_PATTERN = buildKeywordPattern(TEAMMATE_TERMS);
export const BACKGROUND_PATTERN = buildKeywordPattern(BACKGROUND_TERMS);
export const COMPLEXITY_PATTERN = buildKeywordPattern(COMPLEXITY_TERMS);

function buildKeywordPattern(terms: readonly string[]): RegExp {
  return new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
