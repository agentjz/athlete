import type { SessionStore } from "../session/index.js";
import { runHostTurn } from "../host/turn.js";
import { createRuntimeUiAgentCallbacks } from "../runtime-ui/agentCallbacks.js";
import { loadSpecRuntime } from "../spec/runtime.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { buildOneShotCloseoutReport } from "./oneShot.js";

export async function runSpecOneShotPrompt(
  prompt: string,
  cwd: string,
  config: RuntimeConfig,
  session: SessionRecord,
  sessionStore: SessionStore,
) {
  const specRuntime = await loadSpecRuntime({
    cwd,
    sessionId: session.id,
    projectDocMaxBytes: config.projectDocMaxBytes,
  });
  const runtimeUi = createRuntimeUiAgentCallbacks({
    channel: "lead",
    config,
    cwd: specRuntime.cwd,
    assistantLeadingBlankLine: false,
    assistantTrailingNewlines: "\n",
    reasoningLeadingBlankLine: false,
    toolArgsMaxChars: 160,
  });

  const outcome = await runHostTurn({
    host: "cli:spec",
    input: prompt,
    cwd: specRuntime.cwd,
    stateRootDir: specRuntime.stateRootDir,
    config,
    session,
    sessionStore,
    callbacks: runtimeUi.callbacks,
    builtinToolFilter: specRuntime.builtinToolFilter,
    extraTools: specRuntime.tools,
    runtimePromptState: {
      mode: "spec",
      extraStaticBlocks: [specRuntime.promptBlock],
    },
  });

  if (outcome.status === "failed" || outcome.status === "aborted") {
    runtimeUi.flush();
  }

  return {
    session: outcome.session,
    closeout: buildOneShotCloseoutReport(
      outcome.session,
      outcome.result?.transition ?? null,
      outcome.status === "failed" || outcome.status === "aborted" ? outcome.errorMessage : undefined,
    ),
  };
}
