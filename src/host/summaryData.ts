import {
  buildContextRuntimePromptLayers,
  buildContextRuntimeRequest,
} from "../agent/contextRuntime/index.js";
import { resolveAgentProfile } from "../agent/profiles/registry.js";
import type { RuntimePromptDiagnostics } from "../agent/runtimeMetrics.js";
import { loadPromptRuntimeState } from "../agent/runtimeState.js";
import { loadProjectContext } from "../context/projectContext.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

const RUNTIME_SUMMARY_IDENTITY = { kind: "lead" as const, name: "lead" };

export async function buildRuntimePromptDiagnostics(input: {
  cwd: string;
  session: SessionRecord;
  config: RuntimeConfig;
}): Promise<RuntimePromptDiagnostics | undefined> {
  try {
    const projectContext = await loadProjectContext(input.cwd);
    const runtimeState = await loadPromptRuntimeState(projectContext.stateRootDir, RUNTIME_SUMMARY_IDENTITY, input.cwd);
    const promptLayers = buildContextRuntimePromptLayers({
      cwd: input.cwd,
      config: input.config,
      projectContext,
      taskState: input.session.taskState,
      todoItems: input.session.todoItems,
      verificationState: input.session.verificationState,
      runtimeState,
      checkpoint: input.session.checkpoint,
      acceptanceState: input.session.acceptanceState,
      profile: resolveAgentProfile(input.config.profile),
      messages: input.session.messages,
    });
    const requestContext = buildContextRuntimeRequest({
      prompt: promptLayers,
      session: input.session,
      config: input.config,
    });

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
