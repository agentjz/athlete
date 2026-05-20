import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { appendObservabilityEvent, getObservabilityPaths } from "../../src/observability/writer.js";
import { createTempWorkspace } from "../helpers.js";

test("observability writes jsonl side-channel events", async (t) => {
  const root = await createTempWorkspace("observability", t);
  const record = await appendObservabilityEvent(root, {
    event: "host.turn.started",
    status: "started",
    details: { host: "test" },
  });
  const paths = getObservabilityPaths(root);
  const filePath = path.join(paths.observabilityEventsDir, `${record.timestamp.slice(0, 10)}.jsonl`);
  const content = await fs.readFile(filePath, "utf8");

  assert.match(content, /host\.turn\.started/);
});
