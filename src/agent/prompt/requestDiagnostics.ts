export interface PromptContextDiagnostics {
  maxContextChars: number;
  initialEstimatedChars: number;
  finalEstimatedChars: number;
  summaryChars: number;
  tailMessageCount: number;
  compactedTail: boolean;
}

export function createPromptContextDiagnostics(input: {
  maxContextChars: number;
  initialEstimatedChars: number;
  finalEstimatedChars: number;
  summaryChars?: number;
  tailMessageCount: number;
  compactedTail: boolean;
}): PromptContextDiagnostics {
  return {
    maxContextChars: Math.max(1, Math.trunc(input.maxContextChars)),
    initialEstimatedChars: Math.max(0, Math.trunc(input.initialEstimatedChars)),
    finalEstimatedChars: Math.max(0, Math.trunc(input.finalEstimatedChars)),
    summaryChars: Math.max(0, Math.trunc(input.summaryChars ?? 0)),
    tailMessageCount: Math.max(0, Math.trunc(input.tailMessageCount)),
    compactedTail: input.compactedTail,
  };
}
