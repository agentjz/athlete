import type { PromptLayers } from "./promptSections.js";
import type { AgentCallbacks } from "./types.js";
import type { SessionCheckpoint } from "../types.js";

export function extendPromptLayersForTurnState(
  promptLayers: PromptLayers,
  checkpoint: SessionCheckpoint | undefined,
  iteration: number,
  softToolLimit: number,
  consecutiveRequestFailures: number,
): PromptLayers {
  const nextDynamicBlocks = [...promptLayers.dynamicBlocks];
  const shouldShowTurnState = iteration > 0 || consecutiveRequestFailures > 0 || Boolean(checkpoint);

  if (shouldShowTurnState) {
    const phase = checkpoint?.flow?.phase ?? "active";
    const reason = checkpoint?.flow?.reason ? ` (${checkpoint.flow.reason})` : "";
    nextDynamicBlocks.push(
      [
        "Turn execution state:",
        `- Tool steps completed in this request: ${iteration}/${softToolLimit}`,
        `- Checkpoint phase: ${phase}${reason}`,
        `- Provider retry count in this request: ${consecutiveRequestFailures}`,
        "- Use the session checkpoint block above as the source of truth for resumed progress.",
      ].join("\n"),
    );
  }

  return {
    ...promptLayers,
    dynamicBlocks: nextDynamicBlocks,
  };
}

export function emitTurnProgressStatus(
  callbacks: AgentCallbacks | undefined,
  iteration: number,
  softToolLimit: number,
  continuationWindow: number,
): void {
  if (iteration <= 0) {
    return;
  }

  if (iteration % continuationWindow === 0) {
    callbacks?.onStatus?.(
      `Reached ${iteration} tool steps. Auto-continuing into another continuation window...`,
    );
    return;
  }

  if (iteration % softToolLimit === 0) {
    callbacks?.onStatus?.(
      `Reached ${iteration} tool steps. Continuing automatically with compressed context...`,
    );
  }
}
