import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { httpProbeTool } from "../src/tools/network/httpProbeTool.js";
import { createTempWorkspace, makeToolContext } from "./helpers.js";

test("http_probe verifies a local endpoint and returns a readable preview", async (t) => {
  const root = await createTempWorkspace("http-probe", t);

  const server = http.createServer((request, response) => {
    if (request.url === "/api/news") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify([{ title: "Probe ok", source_name: "official" }]));
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/news`;

  const result = await httpProbeTool.execute(
    JSON.stringify({
      url,
      expect_status: 200,
      body_contains: ["Probe ok", "source_name"],
    }),
    makeToolContext(root, root) as never,
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.status, 200);
  assert.match(String(payload.body ?? ""), /Probe ok/);
  assert.match(String(payload.body ?? ""), /source_name/);
});
