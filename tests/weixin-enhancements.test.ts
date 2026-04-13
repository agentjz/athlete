import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("README documents Weixin login serve logout setup, context_token behavior, and private-only limits", async () => {
  const readme = await fs.readFile(path.join(process.cwd(), "README.md"), "utf8");

  assert.match(readme, /athlete weixin login/i);
  assert.match(readme, /athlete weixin serve/i);
  assert.match(readme, /athlete weixin logout/i);
  assert.match(readme, /ATHLETE_WEIXIN_ALLOWED_USER_IDS/);
  assert.match(readme, /context_token/i);
  assert.match(readme, /private/i);
  assert.match(readme, /group/i);
  assert.match(readme, /image|video|file|voice/i);
});

test("spec and implementation mapping document the Weixin private-chat channel and src/weixin modules", async () => {
  const moduleDoc = await fs.readFile(
    path.join(process.cwd(), "spec", "技术实现", "关键模块", "微信私聊.md"),
    "utf8",
  );
  const mapping = await fs.readFile(
    path.join(process.cwd(), "spec", "技术实现", "代码地图", "目录到代码映射.md"),
    "utf8",
  );

  assert.match(moduleDoc, /Weixin/i);
  assert.match(moduleDoc, /context_token/i);
  assert.match(moduleDoc, /\/stop/);
  assert.match(moduleDoc, /private-only|private only|仅支持私聊/i);
  assert.match(moduleDoc, /image|video|file|voice/i);
  assert.match(mapping, /src\/weixin|src\\weixin/i);
});
