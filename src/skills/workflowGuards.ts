import type { SessionRecord, ToolExecutionResult } from "../types.js";
import type { SkillRuntimeState } from "./types.js";

export function getWorkflowToolGateResult(
  toolName: string,
  rawArgs: string,
  session: Pick<SessionRecord, "messages">,
  runtimeState: SkillRuntimeState,
): ToolExecutionResult | null {
  void toolName;
  void rawArgs;
  void session;
  void runtimeState;
  return null;
}
