import { adaptDiscoveredMcpTools } from "../toolAdapter.js";
import type { LazyMcpToolRunner } from "../lazyToolRunner.js";
import type { McpDiscoveredTool } from "../types.js";
import type { RegisteredTool } from "../../tools/core/types.js";

const PLAYWRIGHT_SERVER_NAME = "playwright";

const PLAYWRIGHT_BROWSER_TOOL_SPECS: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
}> = [
  {
    name: "browser_navigate",
    description: "Navigate the browser to a URL. Use when real browser rendering or interaction is required.",
    inputSchema: objectSchema({
      url: {
        type: "string",
        description: "The URL to navigate to.",
      },
    }, ["url"]),
    readOnly: false,
  },
  {
    name: "browser_snapshot",
    description: "Capture an accessibility snapshot of the current browser page.",
    inputSchema: objectSchema({}),
    readOnly: true,
  },
  {
    name: "browser_click",
    description: "Click an element on the current browser page using a snapshot ref.",
    inputSchema: objectSchema({
      element: {
        type: "string",
        description: "Human-readable element description from the page snapshot.",
      },
      ref: {
        type: "string",
        description: "Element ref from browser_snapshot.",
      },
    }, ["element", "ref"]),
    readOnly: false,
  },
  {
    name: "browser_type",
    description: "Type text into an element on the current browser page using a snapshot ref.",
    inputSchema: objectSchema({
      element: {
        type: "string",
        description: "Human-readable element description from the page snapshot.",
      },
      ref: {
        type: "string",
        description: "Element ref from browser_snapshot.",
      },
      text: {
        type: "string",
        description: "Text to type into the element.",
      },
    }, ["element", "ref", "text"]),
    readOnly: false,
  },
  {
    name: "browser_take_screenshot",
    description: "Take a screenshot of the current browser page or a referenced element.",
    inputSchema: objectSchema({
      filename: {
        type: "string",
        description: "Optional output filename for the screenshot artifact.",
      },
      fullPage: {
        type: "boolean",
        description: "Whether to capture the full page.",
      },
      element: {
        type: "string",
        description: "Optional human-readable element description from the page snapshot.",
      },
      ref: {
        type: "string",
        description: "Optional element ref from browser_snapshot.",
      },
    }),
    readOnly: true,
  },
];

export function createLazyPlaywrightMcpTools(runner: LazyMcpToolRunner): RegisteredTool[] {
  return adaptDiscoveredMcpTools(
    PLAYWRIGHT_BROWSER_TOOL_SPECS.map((spec): McpDiscoveredTool => ({
      serverName: PLAYWRIGHT_SERVER_NAME,
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      readOnly: spec.readOnly,
      invoke: (input, context) => runner.invoke(PLAYWRIGHT_SERVER_NAME, spec.name, input, context),
    })),
  );
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
