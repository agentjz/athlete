import { createMcpClient, PlaceholderMcpClient } from "./client.js";
import type { McpClient, McpDiscoverySnapshot, ResolvedMcpServerDefinition } from "./types.js";

export type McpClientFactory = (server: ResolvedMcpServerDefinition) => McpClient;

export interface DiscoveredMcpConnection {
  client: McpClient | null;
  snapshot: McpDiscoverySnapshot;
}

export async function discoverMcpConnection(
  server: ResolvedMcpServerDefinition,
  clientFactory: McpClientFactory = createMcpClient,
): Promise<DiscoveredMcpConnection> {
  if (!server.enabled) {
    return {
      client: null,
      snapshot: {
        server,
        status: "disabled",
        tools: [],
        instructions: [],
        diagnostics: [`MCP server "${server.name}" is disabled in config.`],
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const client = clientFactory(server);
  try {
    return {
      client,
      snapshot: await client.discover(),
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    return {
      client: null,
      snapshot: {
        server,
        status: "error",
        tools: [],
        instructions: [],
        diagnostics: [error instanceof Error ? error.message : String(error)],
        updatedAt: new Date().toISOString(),
      },
    };
  }
}

export async function discoverMcpServers(
  servers: ResolvedMcpServerDefinition[],
  clientFactory: McpClientFactory = createMcpClient,
): Promise<McpDiscoverySnapshot[]> {
  const discoveries: McpDiscoverySnapshot[] = [];
  const activeClients: McpClient[] = [];

  for (const server of servers) {
    const discovered = await discoverMcpConnection(server, clientFactory);
    discoveries.push(discovered.snapshot);
    if (discovered.client) {
      activeClients.push(discovered.client);
    }
  }

  for (const client of activeClients) {
    await client.close().catch(() => undefined);
  }

  return discoveries;
}

export function createPlaceholderMcpClient(server: ResolvedMcpServerDefinition): McpClient {
  return new PlaceholderMcpClient(server);
}

export async function closeMcpClients(clients: readonly McpClient[]): Promise<void> {
  for (const client of clients) {
    try {
      await client.close().catch(() => undefined);
    } catch {
      continue;
    }
  }
}
