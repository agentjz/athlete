import fs from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import { preparePlaywrightRuntimeArtifacts } from "./playwright/artifacts.js";
import { ensurePlaywrightBrowserAvailableForServer } from "./playwright/browserInstall.js";
import { normalizePlaywrightToolInput } from "./playwright/invoke.js";
import type {
  McpClient,
  McpDiscoverySnapshot,
  McpDiscoveredTool,
  McpInvocationContext,
  McpToolCallResult,
  ResolvedMcpServerDefinition,
} from "./types.js";

const STDERR_HISTORY_LIMIT = 40;

export class StdioMcpClient implements McpClient {
  private readonly client = new Client(
    {
      name: "deadmouse",
      version: "0.1.2",
    },
    {
      capabilities: {},
    },
  );

  private readonly transport: StdioClientTransport;
  private readonly stderrLines: string[] = [];
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(readonly server: ResolvedMcpServerDefinition) {
    this.transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd || undefined,
      env: buildServerEnv(server),
      stderr: "pipe",
    });
    this.transport.stderr?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        this.stderrLines.push(line);
      }

      if (this.stderrLines.length > STDERR_HISTORY_LIMIT) {
        this.stderrLines.splice(0, this.stderrLines.length - STDERR_HISTORY_LIMIT);
      }
    });
  }

  async discover(): Promise<McpDiscoverySnapshot> {
    await this.ensureConnected();
    const tools = await listAllTools(this.client, this.server.timeoutMs);

    return {
      server: this.server,
      status: "ready",
      tools: tools.map((tool) => this.adaptTool(tool)),
      instructions: normalizeInstructions(this.client.getInstructions()),
      diagnostics: [...this.stderrLines],
      updatedAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    this.connectPromise = null;

    try {
      await this.client.close();
    } catch {
      await this.transport.close().catch(() => undefined);
    } finally {
      this.connected = false;
    }
  }

  private adaptTool(tool: Tool): McpDiscoveredTool {
    return {
      serverName: this.server.name,
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? {
        type: "object",
        properties: {},
      },
      readOnly: tool.annotations?.readOnlyHint === true,
      invoke: async (input, context) => this.invokeTool(tool.name, input, context),
    };
  }

  private async invokeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: McpInvocationContext,
  ): Promise<McpToolCallResult> {
    await this.ensureConnected();
    const normalizedInput = await normalizePlaywrightToolInput(this.server, toolName, input);

    const result = await this.client.callTool(
      {
        name: toolName,
        arguments: normalizedInput,
      },
      undefined,
      {
        signal: context.signal,
        timeout: this.server.timeoutMs,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: this.server.timeoutMs,
      },
    );

    return {
      ok: result.isError !== true,
      output: formatToolResult(result),
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = (async () => {
      await ensureConfiguredDirectories(this.server);
      await this.client.connect(this.transport, {
        timeout: this.server.timeoutMs,
      });
      this.connected = true;
    })();

    try {
      await this.connectPromise;
    } catch (error) {
      this.connected = false;
      await this.transport.close().catch(() => undefined);
      throw error;
    } finally {
      this.connectPromise = null;
    }
  }
}

async function listAllTools(
  client: Client,
  timeoutMs: number,
): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools(
      cursor ? { cursor } : undefined,
      {
        timeout: timeoutMs,
      },
    );
    tools.push(...result.tools);
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}

function buildServerEnv(server: ResolvedMcpServerDefinition): Record<string, string> {
  const env = {
    ...server.env,
  };

  if (server.auth.type === "token" && server.auth.tokenEnv) {
    const tokenValue = process.env[server.auth.tokenEnv];
    if (tokenValue) {
      env[server.auth.tokenEnv] = tokenValue;
    }
  }

  return env;
}

function normalizeInstructions(instructions: string | undefined): string[] {
  const value = instructions?.trim();
  return value ? [value] : [];
}

function formatToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if ("toolResult" in result) {
    return JSON.stringify(result.toolResult, null, 2);
  }

  const contentParts = result.content.map((item) => {
    switch (item.type) {
      case "text":
        return item.text.trim();
      case "image":
        return `[image:${item.mimeType}; ${item.data.length} bytes]`;
      case "audio":
        return `[audio:${item.mimeType}; ${item.data.length} bytes]`;
      case "resource":
        return "text" in item.resource
          ? item.resource.text
          : `[resource:${item.resource.uri}; blob:${item.resource.mimeType ?? "application/octet-stream"}]`;
      case "resource_link":
        return `[resource-link:${item.uri}]`;
      default:
        return JSON.stringify(item);
    }
  }).filter(Boolean);

  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    contentParts.push(JSON.stringify(result.structuredContent, null, 2));
  }

  const output = contentParts.join("\n\n").trim();
  return output || JSON.stringify(result, null, 2);
}

async function ensureConfiguredDirectories(server: ResolvedMcpServerDefinition): Promise<void> {
  await ensurePlaywrightBrowserAvailableForServer(server);

  const userDataDir = readFlagValue(server.args, "--user-data-dir");
  if (userDataDir) {
    await fs.mkdir(userDataDir, { recursive: true });
  }

  const storageState = readFlagValue(server.args, "--storage-state");
  if (storageState) {
    await fs.mkdir(path.dirname(storageState), { recursive: true });
  }

  const outputDir = readFlagValue(server.args, "--output-dir");
  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  await preparePlaywrightRuntimeArtifacts(server);
}

function readFlagValue(args: string[], flagName: string): string {
  const index = args.indexOf(flagName);
  if (index < 0) {
    return "";
  }

  return String(args[index + 1] ?? "");
}
