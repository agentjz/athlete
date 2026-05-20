import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("network extension supports HTTP sessions, requests, probes, downloads, and suites", async (t) => {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(JSON.stringify({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      sessionHeader: request.headers["x-test"],
      ok: true,
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const root = await createTempWorkspace("network-extension", t);
  const context = createToolContext(root);
  context.config.extensions.network = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const session = await registry.execute("http_session", JSON.stringify({
    action: "create",
    session_id: "local",
    base_url: baseUrl,
    headers: { "x-test": "yes" },
    query: { from_session: "1" },
    cookies: { sid: "abc" },
    token: "secret-token-1234",
  }), context);
  assert.equal(session.ok, true);
  assert.equal(session.metadata?.changedPaths?.length, 1);
  assert.equal(parseToolJson(session.output).session && (parseToolJson(session.output).session as Record<string, unknown>).token, "secr***34");

  const listed = await registry.execute("http_session", JSON.stringify({
    action: "list",
  }), context);
  assert.equal(listed.ok, true);
  assert.equal((parseToolJson(listed.output).sessions as unknown[]).length, 1);

  const fetched = await registry.execute("http_session", JSON.stringify({
    action: "get",
    session_id: "local",
  }), context);
  assert.equal(parseToolJson(fetched.output).session && true, true);

  const probe = await registry.execute("http_probe", JSON.stringify({
    url: `${baseUrl}/health`,
  }), context);
  assert.equal(probe.ok, true);
  assert.equal(parseToolJson(probe.output).status, 200);

  const request = await registry.execute("http_request", JSON.stringify({
    session_id: "local",
    url: "/hello",
    expect_status: 200,
    body_contains: ["hello"],
  }), context);
  assert.equal(request.ok, true);
  const requestPayload = parseToolJson(request.output);
  assert.equal(requestPayload.status, 200);
  assert.match(String(requestPayload.url), /from_session=1/);
  assert.match(String(requestPayload.body), /Bearer secret-token-1234/);
  assert.match(String(requestPayload.body), /sid=abc/);

  const replaced = await registry.execute("http_session", JSON.stringify({
    action: "update",
    session_id: "local",
    headers: { "x-test": "replaced" },
    cookies: { sid: "xyz" },
    replace: true,
  }), context);
  assert.equal(replaced.ok, true);
  const replacedSession = parseToolJson(replaced.output).session as Record<string, unknown>;
  assert.deepEqual(replacedSession.headers, { "x-test": "replaced" });
  assert.deepEqual(replacedSession.cookies, { sid: "xyz" });

  const suite = await registry.execute("http_suite", JSON.stringify({
    session_id: "local",
    steps: [
      {
        id: "hello",
        request: { url: "/hello" },
        assertions: { status: 200, body_contains: ["hello"] },
      },
    ],
  }), context);
  assert.equal(suite.ok, true);
  assert.equal(parseToolJson(suite.output).ok, true);

  const downloadPath = path.join(root, "tmp", "hello.json");
  const download = await registry.execute("download_url", JSON.stringify({
    url: `${baseUrl}/download`,
    path: downloadPath,
  }), context);
  assert.equal(download.ok, true);
  assert.deepEqual(download.metadata?.changedPaths, [downloadPath]);
  assert.match(await fs.readFile(downloadPath, "utf8"), /download/);

  const deleted = await registry.execute("http_session", JSON.stringify({
    action: "delete",
    session_id: "local",
  }), context);
  assert.equal(deleted.ok, true);
  assert.equal(parseToolJson(deleted.output).deleted, true);
  assert.equal(deleted.metadata?.changedPaths?.length, 1);
});

test("network extension records traces and inspects OpenAPI documents", async (t) => {
  const root = await createTempWorkspace("network-openapi", t);
  const context = createToolContext(root);
  context.config.extensions.network = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const trace = await registry.execute("network_trace", JSON.stringify({
    trace_id: "signup-flow",
    summary: "captures request and response facts",
    request: { method: "POST", url: "https://example.com/signup" },
    response: { status: 201 },
  }), context);
  assert.equal(trace.ok, true);
  assert.equal(trace.metadata?.changedPaths?.length, 1);
  assert.match(await fs.readFile(String(parseToolJson(trace.output).path), "utf8"), /signup-flow/);

  const openapiPath = path.join(root, "openapi.json");
  await fs.writeFile(openapiPath, JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Local API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          operationId: "listUsers",
          summary: "List users",
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }), "utf8");

  const inspected = await registry.execute("openapi_inspect", JSON.stringify({
    source: openapiPath,
  }), context);
  assert.equal(inspected.ok, true);
  const inspectedPayload = parseToolJson(inspected.output);
  assert.equal(inspectedPayload.operationsCount, 1);
  assert.equal(inspectedPayload.title, "Local API");
  assert.deepEqual((inspectedPayload.operations as Array<Record<string, unknown>>)[0], {
    path: "/users",
    method: "GET",
    operationId: "listUsers",
    summary: "List users",
  });

  const linted = await registry.execute("openapi_lint", JSON.stringify({
    source: openapiPath,
  }), context);
  assert.equal(linted.ok, true);
  assert.deepEqual(parseToolJson(linted.output).summary, { errorCount: 0, warningCount: 0 });
  assert.deepEqual(parseToolJson(linted.output).findings, []);
});

test("OpenAPI tools read UTF-8 BOM JSON and return structured lint facts", async (t) => {
  const root = await createTempWorkspace("network-openapi-bom", t);
  const context = createToolContext(root);
  context.config.extensions.network = true;
  const registry = await createDefaultAgentToolRegistry(context.config);
  const openapiPath = path.join(root, "openapi-bom.json");
  const body = JSON.stringify({
    openapi: "3.1.0",
    info: { title: "BOM API", version: "1.0.0" },
    paths: { "/ping": { get: { responses: { "200": { description: "ok" } } } } },
  });
  await fs.writeFile(openapiPath, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(body, "utf8"),
  ]));

  const inspected = await registry.execute("openapi_inspect", JSON.stringify({
    source: openapiPath,
    operations_limit: 5,
  }), context);
  assert.equal(inspected.ok, true);
  assert.equal(parseToolJson(inspected.output).operationsCount, 1);

  const linted = await registry.execute("openapi_lint", JSON.stringify({
    source: openapiPath,
  }), context);
  assert.equal(linted.ok, true);
  assert.deepEqual(parseToolJson(linted.output).summary, { errorCount: 0, warningCount: 1 });
});

test("network tools reject invalid downloads and malformed traces with factual errors", async (t) => {
  const root = await createTempWorkspace("network-errors", t);
  const context = createToolContext(root);
  context.config.extensions.network = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const download = await registry.execute("download_url", JSON.stringify({
    url: "file:///etc/passwd",
    path: path.join(root, "passwd"),
  }), context);
  assert.equal(download.ok, false);
  assert.equal(parseToolJson(download.output).code, "DOWNLOAD_URL_UNSUPPORTED_PROTOCOL");

  const trace = await registry.execute("network_trace", JSON.stringify({
    trace_id: "bad",
    request: { url: "https://example.com" },
  }), context);
  assert.equal(trace.ok, false);
  assert.equal(parseToolJson(trace.output).code, "NETWORK_TRACE_REQUEST_INVALID");
});
