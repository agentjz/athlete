import { loadProjectContext } from "../context/projectContext.js";
import { createSpecTools } from "../extensions/tools/spec/index.js";
import type { RegisteredTool, ToolFilter } from "../tools/core/types.js";
import { buildSpecModePromptBlock } from "./prompt.js";
import { SpecStore } from "./store.js";
import type { SpecState } from "./types.js";

export interface SpecRuntime {
  activeSpec: SpecState | null;
  cwd: string;
  stateRootDir: string;
  promptBlock: string;
  tools: readonly RegisteredTool[];
  builtinToolFilter: ToolFilter;
}

export async function loadSpecRuntime(input: {
  cwd: string;
  sessionId: string;
  projectDocMaxBytes: number;
}): Promise<SpecRuntime> {
  const projectContext = await loadProjectContext(input.cwd, {
    projectDocMaxBytes: input.projectDocMaxBytes,
  });
  const store = new SpecStore(projectContext.stateRootDir, {
    rootDir: projectContext.rootDir,
  });
  const binding = await store.loadSessionBinding(input.sessionId);
  const activeSpec = binding ? await store.load(binding.specId).catch(() => null) : null;
  return {
    activeSpec,
    cwd: activeSpec?.workspace?.path ?? input.cwd,
    stateRootDir: projectContext.stateRootDir,
    promptBlock: buildSpecModePromptBlock(activeSpec),
    tools: createSpecTools(),
    builtinToolFilter: createSpecBuiltinToolFilter(activeSpec),
  };
}

export function createSpecBuiltinToolFilter(activeSpec: SpecState | null): ToolFilter {
  return activeSpec && isImplementationStageReady(activeSpec)
    ? () => true
    : (tool) => isSpecPlanningBuiltinTool(tool);
}

function isImplementationStageReady(activeSpec: SpecState): boolean {
  return (
    (activeSpec.stage === "implement" || activeSpec.stage === "validate" || activeSpec.stage === "archive") &&
    activeSpec.confirmed.requirements &&
    activeSpec.confirmed.design &&
    activeSpec.confirmed.tasks
  );
}

function isSpecPlanningBuiltinTool(tool: RegisteredTool): boolean {
  const name = tool.definition.function.name;
  return name === "read" || name === "bash";
}
