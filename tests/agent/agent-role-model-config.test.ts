import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/runTurn.js";
import { MemorySessionStore } from "../../src/agent/session.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

test("runAgentTurn sends model requests through the current agent role model profile", async (t) => {
  const root = await createTempWorkspace("agent-role-model-config", t);
  const seenModels: string[] = [];
  const server = await startModelCaptureServer((model) => {
    seenModels.push(model);
  });
  t.after(server.close);

  const config = createTestRuntimeConfig(root);
  config.provider = "openai-compatible";
  config.apiKey = "default-key";
  config.baseUrl = server.baseUrl;
  config.model = "default-model";
  config.agentModelOverrides = {
    lead: {
      provider: "openai-compatible",
      apiKey: "lead-key",
      baseUrl: server.baseUrl,
      model: "lead-model",
    },
    teammate: {
      provider: "openai-compatible",
      apiKey: "team-key",
      baseUrl: server.baseUrl,
      model: "team-model",
    },
    subagent: {
      provider: "openai-compatible",
      apiKey: "subagent-key",
      baseUrl: server.baseUrl,
      model: "subagent-model",
    },
  };

  for (const identity of [
    { kind: "lead" as const, name: "lead" },
    { kind: "teammate" as const, name: "alpha", role: "researcher" },
    { kind: "subagent" as const, name: "explore-task", role: "explore" },
  ]) {
    await runAgentTurn({
      input: "Return a short answer.",
      cwd: root,
      config,
      session: {
        id: `session-${identity.kind}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cwd: root,
        messageCount: 0,
        messages: [],
        todoItems: [],
      },
      sessionStore: new MemorySessionStore(),
      identity,
    });
  }

  assert.deepEqual(seenModels, ["lead-model", "team-model", "subagent-model"]);
});

async function startModelCaptureServer(
  onModel: (model: string) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    const payload = JSON.parse(await readRequestBody(request)) as { model?: unknown };
    onModel(String(payload.model ?? ""));

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "done" } }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start model capture server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
