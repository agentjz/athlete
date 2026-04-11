import assert from "node:assert/strict";
import test from "node:test";

import { createToolMessage } from "../src/agent/session.js";
import { collectAcceptanceSignals } from "../src/agent/acceptance/signals.js";

test("collectAcceptanceSignals normalizes http, browser, and document verification into one signal model", () => {
  const signals = collectAcceptanceSignals([
    createToolMessage(
      "call-http",
      JSON.stringify(
        {
          ok: true,
          url: "http://127.0.0.1:4010/api/news",
          status: 200,
          body: '[{"source_name":"Arrowhead","evidence_excerpt":"Official excerpt"}]',
        },
        null,
        2,
      ),
      "http_probe",
    ),
    createToolMessage(
      "call-browser",
      "### Page\n- Page URL: http://127.0.0.1:4010/\n- Page Title: Helldivers 2 Live Research Dashboard",
      "mcp_webpilot_browser_snapshot",
    ),
    createToolMessage(
      "call-doc",
      JSON.stringify(
        {
          ok: true,
          provider: "alt-document-engine",
          signals: [
            {
              kind: "document_read_completed",
              documentKind: "pdf",
              path: "source/document.pdf",
            },
          ],
        },
        null,
        2,
      ),
      "alt_document_reader",
    ),
  ]);

  const normalized = signals as Array<{
    kind: string;
    url?: string;
    documentKind?: string;
  }>;
  const kinds = normalized.map((signal) => signal.kind);
  assert.deepEqual(kinds, [
    "http_endpoint_verified",
    "web_page_verified",
    "document_read_completed",
  ]);
  assert.equal(normalized[0]?.url, "http://127.0.0.1:4010/api/news");
  assert.equal(normalized[1]?.url, "http://127.0.0.1:4010/");
  assert.equal(normalized[2]?.documentKind, "pdf");
});
