import { shouldYieldTurn } from "../runtimeState.js";
import type { ContextRuntimeToolProgress } from "./types.js";

export interface BuildContextRuntimeToolProgressInput {
  iteration: number;
  maxToolIterations: number;
  maxContinuationBatches: number;
  yieldAfterToolSteps?: number;
}

export function buildContextRuntimeToolProgress(
  input: BuildContextRuntimeToolProgressInput,
): ContextRuntimeToolProgress {
  const softToolLimit = Math.max(1, input.maxToolIterations);
  const continuationWindow = softToolLimit * Math.max(1, input.maxContinuationBatches);

  return {
    iteration: input.iteration,
    softToolLimit,
    continuationWindow,
    yieldAfterToolSteps: input.yieldAfterToolSteps,
    shouldYield: shouldYieldTurn(input.yieldAfterToolSteps, input.iteration),
  };
}
