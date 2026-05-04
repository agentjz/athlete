import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/agent/session.js";
import { createMessage } from "../../src/agent/session/messages.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { createPersistedSession } from "../../src/host/session.js";
import { createExecutionForegroundCallbacks } from "../../src/execution/foregroundCallbacks.js";
import { getForegroundStreamPath } from "../../src/execution/foregroundStream.js";
import { parseForegroundStreamRuntimeUiEvent } from "../../src/runtime-ui/foregroundEvent.js";
import {
  createProjectDirectory,
  createProjectFile,
  deleteProjectPath,
  readProjectFile,
  readProjectTree,
  renameProjectPath,
  writeProjectFile,
} from "../../src/web/files.js";
import { readGitIgnoredPathSet, readGitStatus, readGitSummary, readGitTreeDecorations, readGitTreeStates } from "../../src/web/git.js";
import { createRuntimeLineEvent, createToolCallRuntimeLineSummary, createToolResultRuntimeLine, extractWorkbenchTodoItems } from "../../src/web/runtimeDisplay.js";
import { resolveProjectPath, toProjectRelativePath } from "../../src/web/safePath.js";
import { startWorkbenchServer } from "../../src/web/server.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo, makeToolContext } from "../helpers.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("web path resolver keeps file access inside the project root", async (t) => {
  const root = await createTempWorkspace("web-path", t);
  const file = path.join(root, "src", "index.ts");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "export {}\n", "utf8");

  assert.equal(resolveProjectPath(root, "src/index.ts"), file);
  assert.equal(toProjectRelativePath(root, file), "src/index.ts");
  assert.throws(() => resolveProjectPath(root, "../outside.txt"), /outside the project root/);
  assert.equal(resolveProjectPath(root, ""), root);
});

test("web file APIs read, write, and show real project directories without server-side hiding", async (t) => {
  const root = await createTempWorkspace("web-files", t);
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(root, "dist", "cli.js"), "module.exports = {}\n", "utf8");
  await fs.writeFile(path.join(root, "src", "app.ts"), "const name = 'kitty';\n", "utf8");
  await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "module.exports = {}\n", "utf8");

  const tree = await readProjectTree(root);
  assert.deepEqual(tree.children?.map((node) => node.name), [".git", "dist", "node_modules", "src"]);

  const read = await readProjectFile(root, "src/app.ts");
  assert.equal(read.path, "src/app.ts");
  assert.match(read.content, /kitty/);

  const written = await writeProjectFile(root, "src/app.ts", "const name = 'workbench';\n");
  assert.equal(written.path, "src/app.ts");
  assert.match((await readProjectFile(root, "src/app.ts")).content, /workbench/);
});

test("web file APIs create directories, create files, and rename paths without overwriting", async (t) => {
  const root = await createTempWorkspace("web-file-actions", t);
  await createProjectDirectory(root, "src");
  const created = await createProjectFile(root, "src/feature.ts");
  assert.equal(created.path, "src/feature.ts");
  assert.equal((await readProjectFile(root, "src/feature.ts")).content, "");

  await assert.rejects(() => createProjectFile(root, "src/feature.ts"), /exists|EEXIST/i);
  await fs.writeFile(path.join(root, "src", "existing.ts"), "keep\n", "utf8");
  await assert.rejects(() => renameProjectPath(root, "src/feature.ts", "src/existing.ts"), /already exists/i);

  const renamed = await renameProjectPath(root, "src/feature.ts", "src/renamed.ts");
  assert.deepEqual(renamed, {
    from: "src/feature.ts",
    to: "src/renamed.ts",
    type: "file",
  });
  assert.equal((await readProjectFile(root, "src/renamed.ts")).path, "src/renamed.ts");
  await assert.rejects(() => createProjectDirectory(root, "../outside"), /outside the project root/);
});

test("web file APIs delete files and directories inside the project root", async (t) => {
  const root = await createTempWorkspace("web-file-delete", t);
  await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "nested", "remove.ts"), "delete me\n", "utf8");
  await fs.writeFile(path.join(root, "src", "keep.ts"), "keep\n", "utf8");

  const file = await deleteProjectPath(root, "src/keep.ts");
  assert.deepEqual(file, { path: "src/keep.ts", type: "file" });
  await assert.rejects(() => fs.stat(path.join(root, "src", "keep.ts")), /ENOENT/);

  const directory = await deleteProjectPath(root, "src/nested");
  assert.deepEqual(directory, { path: "src/nested", type: "directory" });
  await assert.rejects(() => fs.stat(path.join(root, "src", "nested")), /ENOENT/);
  await assert.rejects(() => deleteProjectPath(root, "../outside"), /outside the project root/);
});

test("web HTTP file endpoints create, read, write, rename, and reject unsafe paths", async (t) => {
  const root = await createTempWorkspace("web-file-http", t);
  const config = createTestRuntimeConfig(root);
  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "agent",
    port: 0,
  });
  t.after(() => handle.close());

  const createDirectory = await fetch(new URL("/api/directories/create", handle.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src" }),
  });
  assert.equal(createDirectory.status, 200);

  const createFile = await fetch(new URL("/api/files/create", handle.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/app.ts" }),
  });
  assert.equal(createFile.status, 200);
  assert.equal((await createFile.json() as { path: string }).path, "src/app.ts");

  const writeFile = await fetch(new URL("/api/files/write", handle.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/app.ts", content: "export const name = 'kitty';\n" }),
  });
  assert.equal(writeFile.status, 200);

  const readFile = await fetch(new URL("/api/files/read?path=src%2Fapp.ts", handle.url));
  assert.equal(readFile.status, 200);
  assert.match((await readFile.json() as { content: string }).content, /kitty/);

  const renameFile = await fetch(new URL("/api/files/rename", handle.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "src/app.ts", to: "src/main.ts" }),
  });
  assert.equal(renameFile.status, 200);
  assert.deepEqual(await renameFile.json(), {
    from: "src/app.ts",
    to: "src/main.ts",
    type: "file",
  });

  const deleteFile = await fetch(new URL("/api/files/delete", handle.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/main.ts" }),
  });
  assert.equal(deleteFile.status, 200);
  assert.deepEqual(await deleteFile.json(), {
    path: "src/main.ts",
    type: "file",
  });
  const deletedRead = await fetch(new URL("/api/files/read?path=src%2Fmain.ts", handle.url));
  assert.equal(deletedRead.status, 400);

  const unsafe = await fetch(new URL("/api/files/read?path=..%2Foutside.txt", handle.url));
  assert.equal(unsafe.status, 400);
  assert.match((await unsafe.json() as { error: string }).error, /outside the project root/);
});

test("web writes participate in runtime read and edit target-text semantics", async (t) => {
  const root = await createTempWorkspace("web-runtime-edit-target", t);
  const target = path.join(root, "story.txt");
  await fs.writeFile(target, "alpha\nbeta\ngamma\n", "utf8");
  const registry = createToolRegistry();
  const context = makeToolContext(root, root) as never;
  const firstRead = JSON.parse((await registry.execute(
    "read",
    JSON.stringify({ path: "story.txt" }),
    context,
  )).output) as { content: string };
  assert.match(firstRead.content, /2 \| beta/);

  await writeProjectFile(root, "story.txt", "alpha changed\nbeta\ngamma\n");
  const secondRead = JSON.parse((await registry.execute(
    "read",
    JSON.stringify({ path: "story.txt" }),
    context,
  )).output) as { content: string };
  assert.match(secondRead.content, /alpha changed/);
  const edit = await registry.execute(
    "edit",
    JSON.stringify({
      path: "story.txt",
      edits: [{
        oldText: "beta",
        newText: "BETA",
        line: 2,
      }],
    }),
    context,
  );
  assert.equal(edit.ok, true);
  assert.match(await fs.readFile(target, "utf8"), /BETA/);

  await writeProjectFile(root, "story.txt", "alpha changed\nbeta changed\ngamma\n");
  await assert.rejects(
    () => registry.execute(
      "edit",
      JSON.stringify({
        path: "story.txt",
        edits: [{
          oldText: "beta\n",
          newText: "BETA",
          line: 2,
        }],
      }),
      context,
    ),
    /could not find edit/i,
  );
});

test("web runtime line events carry compact display text instead of raw JSON", () => {
  const event = createRuntimeLineEvent({
    channel: "lead",
    kind: "error",
    message: "read failed",
    detail: "read offset must be a 1-based line number.",
  });

  assert(event);
  assert.equal(event.type, "runtime.line");
  assert.equal(event.kind, "error");
  assert.equal(event.message, "read failed");
  assert.doesNotMatch(event.detail ?? "", /"protocol"|"phases"|\{|\}/);
});

test("web runtime line labels come from the runtime UI identity registry", () => {
  const lead = createRuntimeLineEvent({
    channel: "lead",
    kind: "reasoning",
    message: "思考",
  });
  const subagent = createRuntimeLineEvent({
    channel: "subagent",
    kind: "reasoning",
    message: "分析",
  });
  const dream = createRuntimeLineEvent({
    channel: "dream",
    kind: "assistant",
    message: "推演完成",
  });

  assert.equal(lead?.type, "runtime.line");
  assert.equal(subagent?.type, "runtime.line");
  assert.equal(dream?.type, "runtime.line");
  assert.equal(lead?.label, "决策主脑思考");
  assert.equal(subagent?.label, "子代理思考");
  assert.equal(dream?.label, "做梦");
});

test("web chat consumes runtime line labels instead of rebuilding role labels in the browser", async () => {
  const chat = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "chat.js"), "utf8");
  const stream = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "runtimeStream.js"), "utf8");

  assert.doesNotMatch(chat, /labelForRuntimeLine|labelForChannel/);
  assert.doesNotMatch(stream, /labelForChannel/);
  assert.match(stream, /title: event\.label \|\| ""/);
});

test("web todo extraction follows tool payload instead of protocol wrapper noise", () => {
  const raw = JSON.stringify({
    ok: true,
    items: [
      { id: "1", text: "查看仓库", status: "completed" },
      { id: "2", text: "总结结果", status: "in_progress" },
    ],
    preview: "[x] #1: 查看仓库\n[>] #2: 总结结果",
  });

  assert.deepEqual(extractWorkbenchTodoItems(raw), [
    { id: "1", text: "查看仓库", status: "completed" },
    { id: "2", text: "总结结果", status: "in_progress" },
  ]);
});

test("web tool result display suppresses successful tool JSON and keeps failures compact", () => {
  assert.equal(createToolResultRuntimeLine({
    channel: "lead",
    name: "read",
    output: JSON.stringify({ ok: true, path: "package.json", content: "{}" }),
  }), null);

  const failed = createToolResultRuntimeLine({
    channel: "lead",
    name: "read",
    output: JSON.stringify({
      ok: false,
      error: "read offset must be a 1-based line number.",
      protocol: {
        phases: ["prepare", "execute", "finalize"],
      },
    }),
  });

  assert(failed);
  assert.equal(failed.kind, "result");
  assert.match(failed.detail ?? "", /offset/);
  assert.doesNotMatch(failed.detail ?? "", /"protocol"|\{|\}/);
});

test("web workbench starts a fresh session instead of inheriting latest session todos", async (t) => {
  const root = await createTempWorkspace("web-fresh-session", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  await sessionStore.save({
    ...(await sessionStore.create(root)),
    todoItems: [{ id: "1", text: "stale todo", status: "in_progress" }],
  });

  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "agent",
    port: 0,
  });
  t.after(() => handle.close());

  const response = await fetch(new URL("/api/project", handle.url));
  const project = await response.json() as {
    session: { id: string; todos: unknown[] };
    todos: unknown[];
  };

  assert.equal(response.status, 200);
  assert.deepEqual(project.todos, []);
  assert.deepEqual(project.session.todos, []);
  assert.notEqual((await sessionStore.loadLatest())?.id, undefined);
});

test("web session API exposes recent visible messages for page reload replay", async (t) => {
  const root = await createTempWorkspace("web-session-replay", t);
  const config = createTestRuntimeConfig(root);
  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "agent",
    port: 0,
  });
  t.after(() => handle.close());

  const first = await fetch(new URL("/api/session", handle.url));
  const empty = await first.json() as { id: string };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.load(empty.id);
  session = await sessionStore.appendMessages(session, [
    createMessage("user", "你好"),
    createMessage("assistant", "你好，需要我帮你做什么？", {
      reasoningContent: "识别用户问候。",
    }),
  ]);
  await sessionStore.save(session);

  const response = await fetch(new URL("/api/session", handle.url));
  const replay = await response.json() as {
    messages: Array<{ role: string; content: string; reasoningContent?: string }>;
  };

  assert.deepEqual(replay.messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(replay.messages[0]?.content, "你好");
  assert.equal(replay.messages[1]?.reasoningContent, "识别用户问候。");
});

test("web session replay hides internal wake messages", async (t) => {
  const root = await createTempWorkspace("web-session-internal-replay", t);
  const config = createTestRuntimeConfig(root);
  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "agent",
    port: 0,
  });
  t.after(() => handle.close());

  const first = await fetch(new URL("/api/session", handle.url));
  const empty = await first.json() as { id: string };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.load(empty.id);
  session = await sessionStore.appendMessages(session, [
    createMessage("user", "真实任务"),
    createMessage("user", "[internal] Wake lead runtime; runtime state changed."),
    createMessage("assistant", "完成。"),
  ]);
  await sessionStore.save(session);

  const response = await fetch(new URL("/api/session", handle.url));
  const replay = await response.json() as {
    messages: Array<{ role: string; content: string }>;
  };

  assert.deepEqual(replay.messages.map((message) => message.content), ["真实任务", "完成。"]);
});

test("web session replay includes compact tool call runtime lines without tool JSON", async (t) => {
  const root = await createTempWorkspace("web-session-tool-replay", t);
  const config = createTestRuntimeConfig(root);
  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "agent",
    port: 0,
  });
  t.after(() => handle.close());

  const first = await fetch(new URL("/api/session", handle.url));
  const empty = await first.json() as { id: string };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.load(empty.id);
  session = await sessionStore.appendMessages(session, [
    createMessage("assistant", "先看文件。", {
      toolCalls: [{
        id: "call-1",
        type: "function",
        function: {
          name: "read",
          arguments: JSON.stringify({ path: "package.json", offset: 1, limit: 5 }),
        },
      }],
    }),
  ]);
  await sessionStore.save(session);

  const response = await fetch(new URL("/api/session", handle.url));
  const replay = await response.json() as {
    messages: Array<{ toolCalls?: Array<{ runtimeLine?: { message: string } }> }>;
  };

  const line = replay.messages[0]?.toolCalls?.[0]?.runtimeLine;
  assert(line);
  assert.match(line.message, /read package\.json/);
  assert.doesNotMatch(line.message, /\{|\}/);
});

test("web tool call summaries cover ecology tools without raw argument JSON", async () => {
  const line = createToolCallRuntimeLineSummary({
    channel: "lead",
    name: "runtime_event_search",
    args: JSON.stringify({ execution_id: "exec-1", limit: 20 }),
  });
  assert.equal(line.message, "runtime_event_search exec-1 limit=20");
  assert.doesNotMatch(line.message, /\{|\}/);

  const dreaming = createToolCallRuntimeLineSummary({
    channel: "lead",
    name: "dreaming_start",
    args: JSON.stringify({ objective: "只观察当前仓库状态，不写代码。" }),
  });
  assert.match(dreaming.message, /dreaming_start "只观察/);
  assert.doesNotMatch(dreaming.message, /\{|\}/);
});

test("web reasoning rows are collapsible after streaming finishes", async () => {
  const chat = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "chat.js"), "utf8");
  const stream = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "runtimeStream.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "chat.css"), "utf8");

  assert.match(chat, /className = "runtime-toggle"/);
  assert.match(chat, /aria-expanded/);
  assert.match(chat, /toggleReasoning/);
  assert.match(chat, /row\.append\(label, text\)/);
  assert.match(chat, /row\.append\(toggle\)/);
  assert.match(css, /margin: 0 0 0 auto/);
  assert.match(stream, /node\.toggle\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(css, /\.runtime-line\.reasoning\.collapsed \.runtime-text/);
});

test("web markdown renderer uses marked with GFM tables and preserves table HTML", async () => {
  const markdown = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "markdown.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "chat.css"), "utf8");

  assert.match(markdown, /function getMarkedParser/);
  assert.match(markdown, /throw new Error\("Marked failed to initialize\."\)/);
  assert.match(markdown, /throw new Error\("DOMPurify failed to initialize\."\)/);
  assert.match(markdown, /throw new Error\("Markdown renderer is not initialized\."\)/);
  assert.match(markdown, /window\.marked\?\.parse/);
  assert.match(markdown, /window\.marked\?\.marked\?\.parse/);
  assert.match(markdown, /gfm:\s*true/);
  assert.match(markdown, /ADD_TAGS:\s*\["table", "thead", "tbody", "tr", "th", "td"\]/);
  assert.match(css, /\.message-body table/);
  assert.match(css, /\.message-body th,\s*\n\.message-body td/);
});

test("web frontend initializes required DOM and vendor libraries explicitly", async () => {
  const dom = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "dom.js"), "utf8");
  const main = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "main.js"), "utf8");
  const editor = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "editor.js"), "utf8");

  assert.match(dom, /export const elements = \{\}/);
  assert.match(dom, /export function initializeDom/);
  assert.match(dom, /function requireElement/);
  assert.match(dom, /missing required DOM node/);
  assert.match(main, /initializeDom\(\)/);
  assert.match(editor, /Monaco loader failed to initialize/);
  assert.match(editor, /Monaco editor failed to initialize/);
});

test("web work status exposes idle, thinking, and replying animation states", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "index.html"), "utf8");
  const activity = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "activity.js"), "utf8");
  const dom = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "dom.js"), "utf8");
  const events = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "events.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "chat.css"), "utf8");

  assert.match(html, /data-work-state="idle"/);
  assert.match(html, /id="activityLine"/);
  assert.match(html, /id="activitySpinner"/);
  assert.match(html, /id="activityText"/);
  assert.doesNotMatch(html, /id="sessionStatus"/);
  assert.doesNotMatch(html, /class="work-mark"/);
  assert.doesNotMatch(html, /class="work-spinner"/);
  assert.match(activity, /ACTIVITY_FRAMES = \["\|", "\/", "-", "\\\\"\]/);
  assert.match(activity, /export function startThinking/);
  assert.match(activity, /export function startReplying/);
  assert.match(activity, /export function stopActivity/);
  assert.match(activity, /export function showChangeSummary/);
  assert.match(activity, /思考中/);
  assert.match(activity, /回复中/);
  assert.match(activity, /个文件已更改/);
  assert.match(activity, /查看更改/);
  assert.match(activity, /window\.setInterval\(renderFrame, intervalMs\)/);
  assert.doesNotMatch(dom, /sessionStatus|statusSpinner|sessionStatusText|setStatusState/);
  assert.match(events, /function setReplying\(\)/);
  assert.match(events, /event\.message === "streaming"/);
  assert.match(events, /startReplying\("streaming"\)/);
  assert.match(css, /\.activity-line/);
  assert.match(css, /\.change-count\.added/);
  assert.match(css, /\.change-count\.removed/);
  assert.doesNotMatch(css, /\.session-status|\.work-mark|\.work-spinner/);
  assert.match(css, /\.prompt-footer\s*\{[^}]*justify-content: space-between/s);
});

test("web runtime metadata is a compact footer strip instead of duplicated chat header text", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "index.html"), "utf8");
  const dom = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "dom.js"), "utf8");
  const meta = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "projectMeta.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "chat.css"), "utf8");

  assert.match(html, /class="runtime-strip"/);
  assert.match(html, /id="connectionDot"/);
  assert.doesNotMatch(html, /id="connectionBadge"/);
  assert.match(dom, /"connectionDot"/);
  assert.match(dom, /connection-dot \$\{online \? "online" : "offline"\}/);
  assert.match(meta, /formatModelName/);
  assert.match(meta, /elements\.modeMeta\.textContent = "Agent"/);
  assert.match(meta, /elements\.modeMeta\.textContent = "Spec"/);
  assert.match(css, /\.runtime-strip/);
  assert.match(css, /\.connection-dot\.online/);
  assert.match(css, /\.connection-dot\.offline/);
});

test("web diff editor uses a stable preallocated host and relayouts after activation", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "index.html"), "utf8");
  const dom = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "dom.js"), "utf8");
  const editor = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "editor.js"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "editor.css"), "utf8");

  assert.match(html, /id="diffHost"/);
  assert.match(dom, /"diffHost"/);
  assert.match(editor, /createDiffEditor\(elements\.diffHost/);
  assert.doesNotMatch(editor, /appendChild\(node\)/);
  assert.match(editor, /elements\.diffHost\.hidden = false/);
  assert.match(editor, /elements\.diffHost\.hidden = true/);
  assert.match(editor, /function layoutDiffEditor/);
  assert.match(editor, /requestAnimationFrame/);
  assert.match(css, /\.editor-host\[hidden\]/);
});

test("web DOM initialization list covers every required HTML id exactly once", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "index.html"), "utf8");
  const dom = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "dom.js"), "utf8");

  const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] as string);
  const domIds = [...dom.matchAll(/"([A-Za-z][A-Za-z0-9]+)"/g)]
    .map((match) => match[1] as string)
    .filter((value) => htmlIds.includes(value));

  assert.deepEqual([...new Set(domIds)].sort(), [...htmlIds].sort());
  assert.equal(domIds.length, new Set(domIds).size);
  assert.match(dom, /throw new Error\(`Kitty web workbench is missing required DOM node: #\$\{id\}`\)/);
});

test("web path actions expose delete through the same file API boundary", async () => {
  const html = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "index.html"), "utf8");
  const main = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "main.js"), "utf8");
  const pathActions = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "pathActions.js"), "utf8");
  const editor = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "editor.js"), "utf8");
  const paths = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "paths.js"), "utf8");

  assert.match(html, /id="deletePathButton"/);
  assert.match(main, /deleteSelectedPath/);
  assert.match(pathActions, /\/api\/files\/delete/);
  assert.match(pathActions, /confirmAction/);
  assert.match(editor, /export function deleteOpenPath/);
  assert.match(editor, /tab\.model\.dispose\(\)/);
  assert.match(paths, /export function isSameOrChildPath/);
  assert.doesNotMatch(editor, /startsWith\(`\$\{.*Path\}\/`\)/);
});

test("web workbench layout avoids fixed desktop-only width and has narrow viewport fallback", async () => {
  const layout = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "css", "layout.css"), "utf8");

  assert.doesNotMatch(layout, /min-width:\s*920px/);
  assert.match(layout, /@media \(max-width: 900px\)/);
  assert.match(layout, /grid-template-columns:\s*1fr/);
  assert.match(layout, /grid-template-rows:\s*minmax\(180px, 24vh\) minmax\(320px, 1fr\) minmax\(300px, 42vh\)/);
  assert.match(layout, /overflow:\s*auto/);
});

test("web frontend modules avoid circular imports", async () => {
  const dir = path.join(process.cwd(), "assets", "web-workbench", "js");
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".js"));
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const text = await fs.readFile(path.join(dir, file), "utf8");
    const deps = [...text.matchAll(/from "\.\/(.+?)\.js"/g)].map((match) => `${match[1]}.js`);
    graph.set(file, deps);
  }

  const cycles = findModuleCycles(graph);
  assert.deepEqual(cycles, []);
});

test("web explorer consumes node gitState instead of inferring git paths in the browser", async () => {
  const explorer = await fs.readFile(path.join(process.cwd(), "assets", "web-workbench", "js", "explorer.js"), "utf8");

  assert.match(explorer, /const gitState = node\.gitState \|\| null/);
  assert.match(explorer, /node\.ignored \? "ignored" : ""/);
  assert.doesNotMatch(explorer, /function gitStateForPath/);
  assert.doesNotMatch(explorer, /function normalizeGitPath/);
  assert.doesNotMatch(explorer, /function isSameOrChildPath/);
  assert.doesNotMatch(explorer, /state\.gitFiles\.find/);
});

test("execution foreground callbacks write ordered runtime-ui events for web and cli renderers", async (t) => {
  const root = await createTempWorkspace("web-foreground-events", t);
  const callbacks = createExecutionForegroundCallbacks({
    rootDir: root,
    executionId: "exec-1",
    label: "subagent",
  });

  callbacks.onAssistantDelta?.("先看");
  callbacks.onReasoningDelta?.("思考中");
  callbacks.onToolCall?.("read", JSON.stringify({ path: "package.json" }));
  callbacks.onToolResult?.("read", JSON.stringify({ ok: true }));
  callbacks.onAssistantDelta?.("看完了");

  const lines = (await fs.readFile(getForegroundStreamPath(root, "exec-1"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  const events = lines.map((line) => parseForegroundStreamRuntimeUiEvent("subagent", "exec-1", line));

  assert.deepEqual(events.map((event) => event.kind), [
    "assistant_text",
    "reasoning",
    "tool_call",
    "tool_result",
    "assistant_text",
  ]);
  assert.equal(events[0]?.channel, "subagent");
  assert.equal(events[4]?.message, "看完了");

  const webLine = createRuntimeLineEvent({
    channel: events[1]!.channel,
    kind: "reasoning",
    message: events[1]!.message ?? "",
    executionId: events[1]!.executionId,
  });
  assert.equal(webLine?.type, "runtime.line");
  assert.equal(webLine?.label, "子代理思考");
});

test("web file tree loads one directory at a time without deep directories hiding root entries", async (t) => {
  const root = await createTempWorkspace("web-tree-lazy", t);
  await fs.mkdir(path.join(root, "assets", "large"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  for (let index = 0; index < 50; index += 1) {
    await fs.writeFile(path.join(root, "assets", "large", `${index}.txt`), `${index}\n`, "utf8");
  }
  await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "module.exports = {}\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(root, "src", "app.ts"), "export {}\n", "utf8");

  const rootTree = await readProjectTree(root);
  const rootNames = rootTree.children?.map((node) => node.name) ?? [];

  assert.deepEqual(rootNames, ["assets", "node_modules", "src", "package.json"]);
  assert.equal(rootTree.children?.find((node) => node.name === "assets")?.loaded, false);
  assert.equal(rootTree.children?.find((node) => node.name === "node_modules")?.loaded, false);

  const assetsTree = await readProjectTree(root, "assets");
  assert.deepEqual(assetsTree.children?.map((node) => node.name), ["large"]);
  assert.equal(assetsTree.children?.[0]?.loaded, false);
});

test("web file tree returns every direct child instead of truncating large directories", async (t) => {
  const root = await createTempWorkspace("web-tree-no-truncate", t);
  const many = path.join(root, "many");
  await fs.mkdir(many, { recursive: true });
  for (let index = 0; index < 520; index += 1) {
    await fs.writeFile(path.join(many, `${String(index).padStart(3, "0")}.txt`), `${index}\n`, "utf8");
  }

  const tree = await readProjectTree(root, "many");
  assert.equal(tree.children?.length, 520);
  assert.equal(tree.children?.[0]?.name, "000.txt");
  assert.equal(tree.children?.[519]?.name, "519.txt");
});

test("web file tree attaches ignored git state from server-side git semantics", async (t) => {
  const root = await createTempWorkspace("web-tree-ignored", t);
  await initGitRepo(root);
  await fs.writeFile(path.join(root, ".gitignore"), [
    "ref/",
    ".kitty/*",
    ".kitty/**/*",
    "live-ecology-test-*",
    "",
  ].join("\n"), "utf8");
  await fs.mkdir(path.join(root, "ref", "pi-mono"), { recursive: true });
  await fs.mkdir(path.join(root, ".kitty", "observability"), { recursive: true });
  await fs.mkdir(path.join(root, "live-ecology-test-20260503-124850"), { recursive: true });
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, ".kitty", "observability", "web.jsonl"), "{}\n", "utf8");
  await fs.writeFile(path.join(root, "ref", "pi-mono", "README.md"), "# ref\n", "utf8");
  await fs.writeFile(path.join(root, "live-ecology-test-20260503-124850", "trace.jsonl"), "{}\n", "utf8");
  await fs.writeFile(path.join(root, "src", "app.ts"), "export {}\n", "utf8");

  const tree = await readProjectTree(root);
  const byName = new Map((tree.children ?? []).map((node) => [node.name, node]));

  assert.equal(byName.get("ref")?.gitState?.ignored, true);
  assert.equal(byName.get("ref")?.ignored, true);
  assert.equal(byName.get(".kitty")?.ignored, true);
  assert.equal(byName.get("live-ecology-test-20260503-124850")?.gitState?.ignored, true);
  assert.equal(byName.get("live-ecology-test-20260503-124850")?.ignored, true);
  assert.notEqual(byName.get("src")?.gitState?.ignored, true);
  assert.notEqual(byName.get("src")?.ignored, true);
});

test("web git tree decorations batch check real git ignored paths without frontend path hacks", async (t) => {
  const root = await createTempWorkspace("web-git-tree-state", t);
  await initGitRepo(root);
  await fs.writeFile(path.join(root, ".gitignore"), [
    "ref/",
    ".kitty/*",
    "!.kitty/.env.example",
    "",
  ].join("\n"), "utf8");
  await fs.mkdir(path.join(root, "ref"), { recursive: true });
  await fs.mkdir(path.join(root, ".kitty"), { recursive: true });
  await fs.writeFile(path.join(root, ".kitty", "prompt-history.jsonl"), "\n", "utf8");
  await fs.writeFile(path.join(root, ".kitty", ".env.example"), "KEEP=1\n", "utf8");

  const ignored = await readGitIgnoredPathSet(root, ["ref", ".kitty", ".kitty/prompt-history.jsonl", ".kitty/.env.example"]);
  assert(ignored.has("ref"));
  assert(!ignored.has(".kitty"));
  assert(ignored.has(".kitty/prompt-history.jsonl"));
  assert(!ignored.has(".kitty/.env.example"));

  const decorations = await readGitTreeDecorations(root, [
    { path: "ref", type: "directory", childPaths: [] },
    { path: ".kitty", type: "directory", childPaths: [".kitty/prompt-history.jsonl", ".kitty/.env.example"] },
  ]);
  assert.equal(decorations.get("ref")?.ignored, true);
  assert.equal(decorations.get("ref")?.status?.ignored, true);
  assert.equal(decorations.get(".kitty")?.ignored, true);
  assert.notEqual(decorations.get(".kitty")?.status?.ignored, true);

  const states = await readGitTreeStates(root, [
    { path: "ref", type: "directory", childPaths: [] },
    { path: ".kitty", type: "directory", childPaths: [".kitty/prompt-history.jsonl", ".kitty/.env.example"] },
  ]);
  assert.equal(states.get("ref")?.ignored, true);
});

test("web git status returns structured changed file records", async (t) => {
  const root = await createTempWorkspace("web-git", t);
  await initGitRepo(root);
  await fs.writeFile(path.join(root, "README.md"), "# changed\n", "utf8");
  await fs.writeFile(path.join(root, "notes.txt"), "new\n", "utf8");
  await fs.writeFile(path.join(root, ".gitignore"), "ignored.log\n", "utf8");
  await fs.writeFile(path.join(root, "ignored.log"), "ignored\n", "utf8");

  const files = await readGitStatus(root);

  assert(files.some((file) => file.path === "README.md" && file.workingTree === "M"));
  assert(files.some((file) => file.path === "notes.txt" && file.index === "?" && file.workingTree === "?"));
  assert(files.some((file) => file.path === "ignored.log" && file.ignored === true));
});

test("web git summary returns changed file count and numstat totals", async (t) => {
  const root = await createTempWorkspace("web-git-summary", t);
  await initGitRepo(root);
  await fs.writeFile(path.join(root, "tracked.txt"), "a\nb\n", "utf8");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "tracked"], { cwd: root, stdio: "ignore" });
  await fs.writeFile(path.join(root, "tracked.txt"), "a\nb\nc\nd\n", "utf8");

  const summary = await readGitSummary(root);

  assert.equal(summary.filesChanged, 1);
  assert.equal(summary.insertions, 2);
  assert.equal(summary.deletions, 0);
});

test("web project API exposes spec mode and active spec workspace", async (t) => {
  const root = await createTempWorkspace("web-spec-mode", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await createPersistedSession(sessionStore, root);
  const spec = await new SpecStore(root, { rootDir: root }).create({
    title: "Workbench Spec",
    sessionId: session.id,
  });
  const handle = await startWorkbenchServer({
    cwd: root,
    config,
    mode: "spec",
    port: 0,
  });
  t.after(() => handle.close());

  const response = await fetch(new URL("/api/project", handle.url));
  const project = await response.json() as {
    mode: string;
    cwd: string;
    activeSpec?: {
      id: string;
      title: string;
      stage: string;
      workspace?: {
        path: string;
      };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(project.mode, "spec");
  assert.equal(project.activeSpec?.id, spec.id);
  assert.equal(project.activeSpec?.title, "Workbench Spec");
  assert.equal(project.activeSpec?.stage, "requirements");
  assert.equal(project.cwd, spec.workspace?.path);
  assert.equal(project.activeSpec?.workspace?.path, spec.workspace?.path);
});

function findModuleCycles(graph: Map<string, string[]>): string[] {
  const cycles = new Set<string>();
  const visiting: string[] = [];
  const visited = new Set<string>();

  const visit = (file: string): void => {
    const activeIndex = visiting.indexOf(file);
    if (activeIndex >= 0) {
      const cycle = visiting.slice(activeIndex).concat(file);
      cycles.add(cycle.join(" -> "));
      return;
    }
    if (visited.has(file)) {
      return;
    }
    visiting.push(file);
    for (const dep of graph.get(file) ?? []) {
      if (graph.has(dep)) {
        visit(dep);
      }
    }
    visiting.pop();
    visited.add(file);
  };

  for (const file of graph.keys()) {
    visit(file);
  }
  return [...cycles].sort();
}


