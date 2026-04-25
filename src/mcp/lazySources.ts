import { createToolSource } from "../tools/registry.js";
import type { ToolRegistrySource } from "../tools/types.js";
import { LazyMcpToolRunner } from "./lazyToolRunner.js";
import { createLazyPlaywrightMcpTools } from "./playwright/lazyTools.js";
import type { McpClientManager } from "./clientManager.js";
import type { McpConfig } from "./types.js";

export function createLazyMcpToolSources(
  config: McpConfig,
  manager: McpClientManager,
): ToolRegistrySource[] {
  if (!config.enabled) {
    return [];
  }

  const runner = new LazyMcpToolRunner(manager);
  const sources: ToolRegistrySource[] = [];

  if (config.playwright.enabled) {
    sources.push(createToolSource("mcp", "mcp:playwright:lazy", createLazyPlaywrightMcpTools(runner)));
  }

  return sources;
}
