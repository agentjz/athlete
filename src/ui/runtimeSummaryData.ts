import { buildRequestContext } from "../agent/context.js";
import { loadPromptRuntimeState } from "../agent/runtimeState.js";
import { buildSystemPromptLayers } from "../agent/systemPrompt.js";
import type { RuntimePromptDiagnostics } from "../agent/runtimeMetrics.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { loadProjectContext } from "../context/projectContext.js";

const RUNTIME_SUMMARY_IDENTITY = { kind: "lead" as const, name: "lead" };

export async function buildRuntimePromptDiagnostics(input: {
  cwd: string;
  session: SessionRecord;
  config: RuntimeConfig;
}): Promise<RuntimePromptDiagnostics | undefined> {
  try {
    const projectContext = await loadProjectContext(input.cwd);
    const runtimeState = await loadPromptRuntimeState(projectContext.stateRootDir, RUNTIME_SUMMARY_IDENTITY, input.cwd);
    const promptLayers = buildSystemPromptLayers(
      input.cwd,
      input.config,
      projectContext,
      input.session.taskState,
      input.session.todoItems,
      input.session.verificationState,
      runtimeState,
      undefined,
      input.session.checkpoint,
    );
    const requestContext = buildRequestContext(promptLayers, input.session.messages, input.config);

    return {
      compressed: requestContext.compressed,
      estimatedChars: requestContext.estimatedChars,
      promptMetrics: requestContext.promptMetrics,
      contextDiagnostics: requestContext.contextDiagnostics,
    };
  } catch {
    return undefined;
  }
}
