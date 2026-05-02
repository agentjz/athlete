import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("live ecology dry-run is part of ordinary verification and live ecology remains explicit", async () => {
  const root = process.cwd();
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const spec = await fs.readFile(
    path.join(root, "spec", "技术实现", "T06-验证与仓库约束", "03-本地命令与流程.md"),
    "utf8",
  );

  assert.equal(packageJson.scripts?.["live:ecology:dry-run"], "tsx tests/production-line/verify-live-ecology.ts --dry-run");
  assert.equal(packageJson.scripts?.["live:ecology"], "tsx tests/production-line/verify-live-ecology.ts");
  assert.match(String(packageJson.scripts?.verify), /live:ecology:dry-run/);
  assert.doesNotMatch(String(packageJson.scripts?.test), /live:ecology/);
  assert.match(spec, /live:ecology:dry-run/);
  assert.match(spec, /不调用真实模型/);
});
