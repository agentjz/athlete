import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("openapi tools read local UTF-8 BOM JSON documents", async (t) => {
  const root = await createTempWorkspace("openapi-bom", t);
  const sourcePath = path.join(root, "openapi-min.json");
  const body = JSON.stringify({
    openapi: "3.0.0",
    info: {
      title: "BOM API",
      version: "1.0.0",
    },
    paths: {
      "/ping": {
        get: {
          operationId: "ping",
          summary: "Ping",
          responses: {
            "200": {
              description: "ok",
            },
          },
        },
      },
    },
    servers: [
      {
        url: "https://example.com",
      },
    ],
  }, null, 2);
  await fs.writeFile(sourcePath, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(body, "utf8"),
  ]));

  const registry = createToolRegistry();
  const context = makeToolContext(root, root) as never;
  const inspect = JSON.parse((await registry.execute(
    "openapi_inspect",
    JSON.stringify({ source: "openapi-min.json", operations_limit: 5 }),
    context,
  )).output) as Record<string, unknown>;
  const lint = JSON.parse((await registry.execute(
    "openapi_lint",
    JSON.stringify({ source: "openapi-min.json" }),
    context,
  )).output) as Record<string, unknown>;

  assert.equal(inspect.ok, true);
  assert.equal(inspect.valid_openapi_shape, true);
  assert.equal(inspect.operations_count, 1);
  assert.equal(lint.ok, true);
  assert.deepEqual(lint.summary, {
    errorCount: 0,
    warningCount: 0,
  });
});
