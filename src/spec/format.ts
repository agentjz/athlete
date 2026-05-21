import type { SpecState, SpecSummary } from "./types.js";

export function summarizeSpec(state: SpecState): SpecSummary {
  return {
    id: state.id,
    title: state.title,
    summary: state.summary,
    stage: state.stage,
    status: state.status,
    updatedAt: state.updatedAt,
    workspace: state.workspace,
    currentCheckpointId: state.currentCheckpointId,
  };
}

export function normalizeSpecMarkdown(content: string): string {
  return `${content.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

export function compactSpecTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
}
