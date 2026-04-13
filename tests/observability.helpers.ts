import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import type { Command } from "commander";
import { getProjectStatePaths } from "../src/project/statePaths.js";

export interface FakeChatCompletionResponse {
  kind: "text" | "tool" | "error";
  content?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  status?: number;
  errorMessage?: string;
}

export async function readObservabilityEvents(rootDir: string): Promise<Array<Record<string, unknown>>> {
  const paths = getProjectStatePaths(rootDir);
  const files = await listSortedFiles(paths.observabilityEventsDir);
  const events: Array<Record<string, unknown>> = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      events.push(JSON.parse(trimmed) as Record<string, unknown>);
    }
  }

  return events;
}

export async function getLatestObservabilityEventFile(rootDir: string): Promise<string | null> {
  const paths = getProjectStatePaths(rootDir);
  const files = await listSortedFiles(paths.observabilityEventsDir);
  return files.at(-1) ?? null;
}

export async function readCrashReports(rootDir: string): Promise<Array<Record<string, unknown>>> {
  const paths = getProjectStatePaths(rootDir);
  const files = await listSortedFiles(paths.observabilityCrashesDir);
  const reports: Array<Record<string, unknown>> = [];

  for (const filePath of files) {
    reports.push(JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>);
  }

  return reports;
}

export async function captureStdout(run: () => Promise<void>): Promise<string> {
  const writes: string[] = [];
  const original = fsSync.writeSync;
  (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = ((fd, buffer, ...rest) => {
    if (fd === 1) {
      writes.push(String(buffer));
    }
    return typeof buffer === "string" ? buffer.length : Buffer.byteLength(String(buffer));
  }) as typeof fsSync.writeSync;

  try {
    await run();
    return writes.join("");
  } finally {
    (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = original;
  }
}

export async function parseCommander(program: Command, argv: string[]): Promise<void> {
  program.exitOverride();

  try {
    await program.parseAsync(argv, {
      from: "user",
    });
  } catch (error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "commander.helpDisplayed" || code === "commander.version") {
      return;
    }

    throw error;
  }
}

export async function startFakeChatCompletionServer(
  respond: (
    payload: { model?: string; messages?: Array<{ role?: string; content?: unknown }> },
  ) => Promise<FakeChatCompletionResponse>,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    const payload = JSON.parse(await readRequestBody(request)) as {
      model?: string;
      messages?: Array<{ role?: string; content?: unknown }>;
    };
    const next = await respond(payload);

    if (next.kind === "error") {
      response.writeHead(next.status ?? 500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: {
          message: next.errorMessage ?? "fake provider error",
        },
      }));
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });
    response.write(`data: ${JSON.stringify(next.kind === "tool"
      ? {
          choices: [{
            delta: {
              tool_calls: (next.toolCalls ?? []).map((toolCall, index) => ({
                index,
                id: `tool-${index}`,
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.args),
                },
              })),
            },
          }],
        }
      : {
          choices: [{
            delta: {
              content: next.content ?? "",
            },
          }],
        })}\n\n`);
    response.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fake chat completion server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function listSortedFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
