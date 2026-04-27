import type { McpClientManager } from "./clientManager.js";
import type { McpDiscoveredTool, McpInvocationContext, McpToolCallResult } from "./types.js";

export class LazyMcpToolRunner {
  private discoveredTools: McpDiscoveredTool[] | null = null;
  private discoveryPromise: Promise<McpDiscoveredTool[]> | null = null;

  constructor(private readonly manager: McpClientManager) {}

  async invoke(
    serverName: string,
    toolName: string,
    input: Record<string, unknown>,
    context: McpInvocationContext,
  ): Promise<McpToolCallResult> {
    const tools = await this.loadTools();
    const tool = tools.find((candidate) => candidate.serverName === serverName && candidate.name === toolName);
    if (!tool) {
      return {
        ok: false,
        output: this.buildMissingToolMessage(serverName, toolName),
      };
    }

    try {
      return await tool.invoke(input, context);
    } catch (error) {
      return {
        ok: false,
        output: `MCP tool '${serverName}.${toolName}' failed during execution: ${formatError(error)}`,
      };
    }
  }

  private async loadTools(): Promise<McpDiscoveredTool[]> {
    if (this.discoveredTools) {
      return this.discoveredTools;
    }

    if (!this.discoveryPromise) {
      this.discoveryPromise = this.refreshTools();
    }

    try {
      const tools = await this.discoveryPromise;
      if (tools.length > 0) {
        this.discoveredTools = tools;
      }
      return tools;
    } finally {
      this.discoveryPromise = null;
    }
  }

  private async refreshTools(): Promise<McpDiscoveredTool[]> {
    await this.manager.refresh();
    return this.manager.getDiscoveredTools();
  }

  private buildMissingToolMessage(serverName: string, toolName: string): string {
    const diagnostics = this.manager.getSnapshots()
      .filter((snapshot) => snapshot.server.name === serverName)
      .flatMap((snapshot) => [
        `status=${snapshot.status}`,
        ...snapshot.diagnostics,
      ])
      .filter((line) => line.trim().length > 0);
    const detail = diagnostics.length > 0 ? ` Diagnostics: ${diagnostics.join(" | ")}` : "";
    return `MCP tool '${serverName}.${toolName}' is not available after lazy startup.${detail}`;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
