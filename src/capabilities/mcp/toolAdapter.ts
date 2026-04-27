import { parseArgs } from "../tools/core/shared.js";
import type { RegisteredTool } from "../tools/core/types.js";
import { browserCapabilityTool, parseBrowserStepFromName, readTool } from "../tools/core/governancePresets.js";
import type { McpDiscoveredTool } from "./types.js";

const MAX_MCP_TOOL_NAME = 64;

export function adaptDiscoveredMcpTools(tools: readonly McpDiscoveredTool[]): RegisteredTool[] {
  return tools.map((tool) => ({
    definition: {
      type: "function",
      function: {
        name: formatMcpToolName(tool.serverName, tool.name),
        description: buildToolDescription(tool),
        parameters: normalizeSchema(tool.inputSchema),
      },
    },
    async execute(rawArgs, context) {
      const args = parseArgs(rawArgs);
      const result = await tool.invoke(args, {
        signal: context.abortSignal,
      });

      return {
        ok: result.ok,
        output: result.output,
      };
    },
    origin: {
      kind: "mcp",
      serverName: tool.serverName,
      toolName: tool.name,
      readOnlyHint: tool.readOnly,
    },
    governance: inferMcpToolGovernance(tool),
  }));
}

export function formatMcpToolName(serverName: string, toolName: string): string {
  const normalized = `mcp_${serverName}_${toolName}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^([^a-zA-Z_])/, "_$1");

  if (normalized.length <= MAX_MCP_TOOL_NAME) {
    return normalized;
  }

  return `${normalized.slice(0, 32)}_${normalized.slice(-31)}`;
}

function buildToolDescription(tool: McpDiscoveredTool): string {
  const description = tool.description.trim();
  const suffix = `MCP server: ${tool.serverName}.`;
  if (tool.serverName === "playwright" && tool.name.startsWith("browser_")) {
    const browserHint = "Browser/webpage tool. Use when real browser rendering, page interaction, login state, screenshots, or dynamic content are required; prefer lightweight HTTP/download tools for static fetches.";
    return [description, browserHint, suffix].filter(Boolean).join(" ");
  }

  return description ? `${description} ${suffix}` : suffix;
}

function normalizeSchema(input: Record<string, unknown>): Record<string, unknown> {
  const schema = input && typeof input === "object" && !Array.isArray(input)
    ? structuredClone(input)
    : {};

  if (schema.type !== "object") {
    schema.type = "object";
  }

  if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    schema.properties = {};
  }

  return schema;
}

function inferMcpToolGovernance(tool: McpDiscoveredTool): RegisteredTool["governance"] | undefined {
  const browserStep = parseBrowserStepFromName(tool.name);
  if (browserStep) {
    return browserCapabilityTool(browserStep);
  }

  if (tool.readOnly) {
    return readTool("external", { source: "mcp", risk: "low" });
  }

  return undefined;
}
