import { getErrorMessage } from "../agent/errors.js";
import type { RuntimeConfig } from "../types.js";
import { buildExtensionEcology } from "./ecology/index.js";
import { recordExtensionEvent } from "./observability.js";
import { buildExtensionRegistry } from "./registry.js";
import {
  createEmptyHookOutput,
  resolveExtensionWorkspace,
  type ExtensionHookName,
  type ExtensionHookOutput,
  type ExtensionHookRun,
  type ExtensionManifest,
  type ExtensionRegistrySnapshot,
  type KittyProductMode,
} from "./protocol/index.js";

export interface ExtensionRuntimeState {
  mode: KittyProductMode;
  registry: ExtensionRegistrySnapshot;
  enabledManifests: ExtensionManifest[];
  promptBlocks: string[];
  hookRuns: ExtensionHookRun[];
}

export interface BuildExtensionRuntimeInput {
  cwd: string;
  config: RuntimeConfig;
  mode: KittyProductMode;
  sessionId: string;
}

export async function buildExtensionRuntimeState(
  input: BuildExtensionRuntimeInput,
): Promise<ExtensionRuntimeState | undefined> {
  const registry = buildExtensionRegistry(input.mode);
  if (input.mode === "agent") {
    return undefined;
  }

  const ecology = buildExtensionEcology();
  const enabledEntries = ecology.entries.filter((entry) => entry.enabled);
  const hookRuns: ExtensionHookRun[] = [];
  const promptBlocks: string[] = [];

  await runHook("super.start");
  const promptOutputs = await runHook("prompt.runtime");
  for (const output of promptOutputs) {
    promptBlocks.push(...output.promptBlocks);
  }

  return {
    mode: input.mode,
    registry,
    enabledManifests: enabledEntries.map((entry) => entry.extension.manifest),
    promptBlocks,
    hookRuns,
  };

  async function runHook(hook: ExtensionHookName): Promise<ExtensionHookOutput[]> {
    const outputs: ExtensionHookOutput[] = [];
    for (const entry of enabledEntries) {
      const extension = entry.extension;
      if (!extension.manifest.hooks.includes(hook)) {
        continue;
      }

      const workspace = resolveExtensionWorkspace(input.cwd, extension.manifest);
      try {
        const output = await extension.runHook(hook, {
          cwd: input.cwd,
          config: input.config,
          mode: input.mode,
          extensionId: extension.manifest.id,
          sessionId: input.sessionId,
          workspaceRoot: workspace.root,
        });
        hookRuns.push({
          extensionId: extension.manifest.id,
          hook,
          status: "completed",
        });
        await recordExtensionEvent(input.cwd, {
          status: "completed",
          extensionId: extension.manifest.id,
          hook,
          workspaceRoot: workspace.root,
        });
        outputs.push(output ?? createEmptyHookOutput());
      } catch (error) {
        const message = getErrorMessage(error);
        hookRuns.push({
          extensionId: extension.manifest.id,
          hook,
          status: "failed",
          message,
        });
        await recordExtensionEvent(input.cwd, {
          status: "failed",
          extensionId: extension.manifest.id,
          hook,
          workspaceRoot: workspace.root,
          error,
        });
      }
    }
    return outputs;
  }
}
