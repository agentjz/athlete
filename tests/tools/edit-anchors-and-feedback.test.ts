import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { InProcessSessionStore } from "../../src/agent/session.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("read_file returns fine-grained anchors and edit_file uses them to disambiguate repeated matches", async (t) => {
  const root = await createTempWorkspace("edit-anchors", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "beta\nalpha\nbeta\n", "utf8");

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  const anchors = readPayload.anchors as Array<Record<string, unknown>>;
  const identity = readPayload.identity as Record<string, unknown>;

  assert.equal(Array.isArray(anchors), true);
  assert.equal(anchors.length >= 3, true);

  const thirdLineAnchor = anchors.find((anchor) => anchor.line === 3);
  assert.ok(thirdLineAnchor);

  const editResult = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: identity,
      edits: [
        {
          anchor: thirdLineAnchor,
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(editResult.output) as Record<string, unknown>;
  const updated = await fs.readFile(filePath, "utf8");

  assert.equal(editResult.ok, true);
  assert.equal(payload.appliedEdits, 1);
  assert.deepEqual(payload.changedPaths, ["story.txt"]);
  assert.deepEqual(payload.absoluteChangedPaths, [filePath]);
  assert.equal(updated, "beta\nalpha\nBETA\n");
});

test("edit_file rejects existing-file edits that omit formal anchors", async (t) => {
  const root = await createTempWorkspace("edit-anchors-required", t);
  await fs.writeFile(path.join(root, "story.txt"), "alpha\nbeta\n", "utf8");

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const identity = (JSON.parse(readResult.output) as Record<string, unknown>).identity;

  const result = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: identity,
      edits: [
        {
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(payload.code, "INVALID_TOOL_ARGUMENTS");
  assert.equal((payload.details as { kind?: unknown } | undefined)?.kind, "required");
  assert.match(String(payload.error ?? ""), /anchor|required/i);
});

test("edit_file preserves UTF-8 BOM and CRLF while editing from fresh read anchors", async (t) => {
  const root = await createTempWorkspace("edit-bom-crlf", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("alpha\r\nbeta\r\ngamma\r\n", "utf8"),
  ]));

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  const identity = readPayload.identity as Record<string, unknown>;
  const anchors = readPayload.anchors as Array<Record<string, unknown>>;
  const betaAnchor = anchors.find((anchor) => anchor.line === 2);

  const editResult = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: identity,
      edits: [
        {
          anchor: betaAnchor,
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );
  const after = await fs.readFile(filePath);

  assert.equal(editResult.ok, true);
  assert.deepEqual([...after.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(after.toString("utf8"), "\uFEFFalpha\r\nBETA\r\ngamma\r\n");
});

test("edit_file can apply two independent edits from one read without refreshing whole-file identity", async (t) => {
  const root = await createTempWorkspace("edit-repeat-without-refresh", t);
  const filePath = path.join(root, "story.txt");
  await fs.writeFile(filePath, "alpha\nbeta\ngamma\n", "utf8");

  const registry = createToolRegistry();
  const readResult = await registry.execute(
    "read_file",
    JSON.stringify({
      path: "story.txt",
    }),
    makeToolContext(root, root) as never,
  );
  const readPayload = JSON.parse(readResult.output) as Record<string, unknown>;
  const identity = readPayload.identity as Record<string, unknown>;
  const anchors = readPayload.anchors as Array<Record<string, unknown>>;

  const first = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: identity,
      edits: [
        {
          anchor: anchors.find((anchor) => anchor.line === 2),
          old_string: "beta",
          new_string: "BETA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );
  const second = await registry.execute(
    "edit_file",
    JSON.stringify({
      path: "story.txt",
      expected_identity: identity,
      edits: [
        {
          anchor: anchors.find((anchor) => anchor.line === 3),
          old_string: "gamma",
          new_string: "GAMMA",
        },
      ],
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(await fs.readFile(filePath, "utf8"), "alpha\nBETA\nGAMMA\n");
});

test("write_file can create an empty file without routing through shell", async (t) => {
  const root = await createTempWorkspace("write-empty-file", t);
  const filePath = path.join(root, "empty.txt");

  const registry = createToolRegistry();
  const result = await registry.execute(
    "write_file",
    JSON.stringify({
      path: "empty.txt",
      content: "",
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(filePath, "utf8"), "");
});

test("write_file returns formal diff, diagnostics, and session diff feedback after a write", async (t) => {
  const root = await createTempWorkspace("write-feedback", t);
  const registry = createToolRegistry();

  const result = await registry.execute(
    "write_file",
    JSON.stringify({
      path: "broken.json",
      content: "{\n  \"broken\": true,\n}\n",
    }),
    makeToolContext(root, root) as never,
  );
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  const diagnostics = payload.diagnostics as Record<string, unknown>;
  const sessionDiff = payload.sessionDiff as Record<string, unknown>;

  assert.equal(result.ok, true);
  assert.equal(typeof payload.diff, "string");
  assert.equal(diagnostics.status, "issues");
  assert.equal((diagnostics.errorCount as number) >= 1, true);
  assert.equal(Array.isArray(diagnostics.files), true);
  assert.equal(Array.isArray(sessionDiff.changedPaths), true);
  assert.deepEqual(sessionDiff.changedPaths, [path.join(root, "broken.json")]);
  assert.deepEqual(payload.changedPaths, ["broken.json"]);
  assert.deepEqual(payload.absoluteChangedPaths, [path.join(root, "broken.json")]);
  assert.equal(result.metadata?.diagnostics?.status, "issues");
  assert.deepEqual(result.metadata?.sessionDiff?.changedPaths, [path.join(root, "broken.json")]);
});

test("runManagedAgentTurn persists session diff into the formal session truth after a write batch", async (t) => {
  const root = await createTempWorkspace("session-diff-truth", t);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    todoItems: [
      {
        id: "todo-1",
        text: "Create artifact.json",
        status: "in_progress",
      },
    ],
  });
  const toolRegistry = createToolRegistry();

  const server = await startFakeOpenAiServer((requestIndex) => {
    if (requestIndex === 1) {
      return {
        kind: "tool",
        toolCalls: [
          {
            id: "tool-plan",
            name: "todo_write",
            args: {
              items: [
                {
                  id: "todo-1",
                  text: "Create artifact.json",
                  status: "in_progress",
                },
              ],
            },
          },
        ],
      };
    }

    if (requestIndex === 2) {
      return {
        kind: "tool",
        toolCalls: [
          {
            id: "tool-1",
            name: "write_file",
            args: {
              path: "artifact.json",
              content: "{\n  \"artifact\": true\n}\n",
            },
          },
        ],
      };
    }

    return {
      kind: "text",
      content: "done",
    };
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Create artifact.json",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 1,
    },
    session,
    sessionStore,
    toolRegistry,
    identity: {
      kind: "teammate",
      name: "session-diff-test",
    },
  });

  assert.equal(result.session.sessionDiff?.changes?.length, 1);
  assert.equal(result.session.sessionDiff?.changes?.[0]?.toolName, "write_file");
  assert.deepEqual(result.session.sessionDiff?.changedPaths, [path.join(root, "artifact.json")]);
});

async function startFakeOpenAiServer(
  respond: (requestIndex: number) => {
    kind: "tool";
    toolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  } | {
    kind: "text";
    content: string;
  },
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  let requestIndex = 0;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    await readRequestBody(request);
    requestIndex += 1;
    const next = respond(requestIndex);

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    if (next.kind === "tool") {
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: next.toolCalls.map((toolCall, index) => ({
                  index,
                  id: toolCall.id,
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.args),
                  },
                })),
              },
            },
          ],
        })}\n\n`,
      );
    } else {
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: next.content,
              },
            },
          ],
        })}\n\n`,
      );
    }

    response.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral HTTP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

