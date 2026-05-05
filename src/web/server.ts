import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import express, { type Request, type Response } from "express";
import { WebSocketServer } from "ws";

import { SessionStore } from "../session/index.js";
import { readUserInput } from "../session/turnFrame.js";
import { getErrorMessage } from "../agent/errors.js";
import { createPersistedSession } from "../host/session.js";
import { runHostTurn } from "../host/turn.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { KittyProductMode } from "../extensions/index.js";
import { formatRuntimeUiRoleLabel } from "../runtime-ui/channelIdentity.js";
import {
  createProjectDirectory,
  createProjectFile,
  deleteProjectPath,
  readProjectFile,
  readProjectTree,
  renameProjectPath,
  writeProjectFile,
} from "./files.js";
import { readGitDiff, readGitStatus, readGitSummary } from "./git.js";
import { WorkbenchBroadcaster } from "./broadcaster.js";
import { nowEventTime } from "./events.js";
import { createRuntimeLineEvent, createToolCallRuntimeLineSummary, sendToolCallLine, sendToolErrorLine, sendToolResultLine } from "./runtimeDisplay.js";
import { recordHostMessage } from "../observability/hostEvents.js";

export interface StartWorkbenchServerOptions {
  cwd: string;
  config: RuntimeConfig;
  host?: string;
  port?: number;
  staticDir?: string;
  mode?: KittyProductMode;
}

export interface WorkbenchServerHandle {
  url: string;
  close(): Promise<void>;
}

export async function startWorkbenchServer(options: StartWorkbenchServerOptions): Promise<WorkbenchServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const app = express();
  const server = http.createServer(app);
  const wsServer = new WebSocketServer({ server, path: "/ws" });
  const broadcaster = new WorkbenchBroadcaster(wsServer);
  const sessionStore = new SessionStore(options.config.paths.sessionsDir);
  let currentSession: SessionRecord = await createWorkbenchSession({
    cwd: options.cwd,
    sessionStore,
  });
  let running = false;
  let activeAbortController: AbortController | undefined;

  app.use(express.json({ limit: "2mb" }));
  const staticDir = options.staticDir ?? resolveWorkbenchAssetDir();
  app.use("/vendor/bootstrap", express.static(resolvePackageRootAsset("bootstrap", "dist")));
  app.use("/vendor/bootstrap-icons", express.static(resolvePackageRootAsset("bootstrap-icons", "font")));
  app.use("/vendor/monaco", express.static(resolvePackageRootAsset("monaco-editor", "min")));
  app.use("/vendor/marked", express.static(path.dirname(require.resolve("marked"))));
  app.use("/vendor/dompurify", express.static(path.dirname(require.resolve("dompurify"))));
  app.use(express.static(staticDir));

  app.get("/api/project", (_request: Request, response: Response) => {
    void handleJson(response, async () => summarizeProject({
      rootCwd: options.cwd,
      config: options.config,
      session: await refreshCurrentSession(),
    }));
  });

  app.get("/api/files/tree", async (request: Request, response: Response) => {
    await handleJson(response, async () => readProjectTree(
      (await loadCurrentWorkbenchContext()).cwd,
      String(request.query.path ?? ""),
    ));
  });

  app.get("/api/files/read", async (request: Request, response: Response) => {
    await handleJson(response, async () => readProjectFile((await loadCurrentWorkbenchContext()).cwd, String(request.query.path ?? "")));
  });

  app.post("/api/files/write", async (request: Request, response: Response) => {
    await handleJson(response, async () => {
      const context = await loadCurrentWorkbenchContext();
      const result = await writeProjectFile(context.cwd, String(request.body?.path ?? ""), String(request.body?.content ?? ""));
      broadcaster.send({ type: "file.changed", paths: [result.path], createdAt: nowEventTime() });
      broadcaster.send({ type: "git.status", files: await readGitStatus(context.cwd), createdAt: nowEventTime() });
      return result;
    });
  });

  app.post("/api/files/create", async (request: Request, response: Response) => {
    await handleJson(response, async () => {
      const context = await loadCurrentWorkbenchContext();
      const result = await createProjectFile(context.cwd, String(request.body?.path ?? ""));
      broadcaster.send({ type: "file.changed", paths: [result.path], createdAt: nowEventTime() });
      broadcaster.send({ type: "git.status", files: await readGitStatus(context.cwd), createdAt: nowEventTime() });
      return result;
    });
  });

  app.post("/api/directories/create", async (request: Request, response: Response) => {
    await handleJson(response, async () => {
      const context = await loadCurrentWorkbenchContext();
      const result = await createProjectDirectory(context.cwd, String(request.body?.path ?? ""));
      broadcaster.send({ type: "file.changed", paths: [result.path], createdAt: nowEventTime() });
      broadcaster.send({ type: "git.status", files: await readGitStatus(context.cwd), createdAt: nowEventTime() });
      return result;
    });
  });

  app.post("/api/files/rename", async (request: Request, response: Response) => {
    await handleJson(response, async () => {
      const context = await loadCurrentWorkbenchContext();
      const result = await renameProjectPath(
        context.cwd,
        String(request.body?.from ?? ""),
        String(request.body?.to ?? ""),
      );
      broadcaster.send({ type: "file.changed", paths: [result.from, result.to], createdAt: nowEventTime() });
      broadcaster.send({ type: "git.status", files: await readGitStatus(context.cwd), createdAt: nowEventTime() });
      return result;
    });
  });

  app.post("/api/files/delete", async (request: Request, response: Response) => {
    await handleJson(response, async () => {
      const context = await loadCurrentWorkbenchContext();
      const result = await deleteProjectPath(context.cwd, String(request.body?.path ?? ""));
      broadcaster.send({ type: "file.changed", paths: [result.path], createdAt: nowEventTime() });
      broadcaster.send({ type: "git.status", files: await readGitStatus(context.cwd), createdAt: nowEventTime() });
      return result;
    });
  });

  app.get("/api/git/status", async (_request: Request, response: Response) => {
    await handleJson(response, async () => readGitStatus((await loadCurrentWorkbenchContext()).cwd));
  });

  app.get("/api/git/diff", async (request: Request, response: Response) => {
    await handleJson(response, async () => ({
      path: String(request.query.path ?? ""),
      diff: await readGitDiff((await loadCurrentWorkbenchContext()).cwd, request.query.path ? String(request.query.path) : undefined),
    }));
  });

  app.get("/api/git/summary", async (_request: Request, response: Response) => {
    await handleJson(response, async () => readGitSummary((await loadCurrentWorkbenchContext()).cwd));
  });

  app.get("/api/session", (_request: Request, response: Response) => {
    void handleJson(response, async () => summarizeSession(await refreshCurrentSession()));
  });

  app.post("/api/session/message", async (request: Request, response: Response) => {
    if (running) {
      response.status(409).json({ error: "A turn is already running." });
      return;
    }

    const input = String(request.body?.input ?? "").trim();
    if (!input) {
      response.status(400).json({ error: "Input is required." });
      return;
    }

    const turnContext = await loadCurrentWorkbenchContext().catch((error) => {
      response.status(400).json({ error: getErrorMessage(error) });
      return null;
    });
    if (!turnContext) {
      return;
    }

    running = true;
    activeAbortController = new AbortController();
    let assistantDoneSent = false;
    broadcaster.send({ type: "session.status", status: "running", message: "running", createdAt: nowEventTime() });
    response.json({ ok: true, session: summarizeSession(currentSession) });
    broadcaster.send({
      type: "project.updated",
      cwd: turnContext.cwd,
      projectName: path.basename(turnContext.cwd),
      createdAt: nowEventTime(),
    });

    void runHostTurn({
      host: "web",
      input,
      cwd: turnContext.cwd,
      stateRootDir: turnContext.stateRootDir,
      config: options.config,
      session: currentSession,
      sessionStore,
      mode: options.mode ?? "agent",
      abortSignal: activeAbortController.signal,
      callbacks: {
        onModelWaitStart: () => broadcaster.send({ type: "session.status", status: "running", message: "waiting for model", createdAt: nowEventTime() }),
        onModelWaitStop: () => broadcaster.send({ type: "session.status", status: "running", message: "streaming", createdAt: nowEventTime() }),
        onAssistantDelta: (delta) => sendWorkbenchRuntimeLine({ channel: "lead", kind: "assistant", message: delta }),
        onAssistantText: (text) => sendWorkbenchRuntimeLine({ channel: "lead", kind: "assistant", message: text }),
        onAssistantStage: (text) => sendWorkbenchRuntimeLine({ channel: "lead", kind: "assistant", message: text }),
        onAssistantDone: () => {
          assistantDoneSent = true;
          broadcaster.send({ type: "assistant.done", createdAt: nowEventTime() });
        },
        onReasoningDelta: (delta) => sendWorkbenchRuntimeLine({ channel: "lead", kind: "reasoning", message: delta }),
        onReasoning: (text) => sendWorkbenchRuntimeLine({ channel: "lead", kind: "reasoning", message: text }),
        onToolCall: (name, args) => {
          recordWebWorkbenchEvent(options.config.paths.dataDir, currentSession.id, "tool.call", { name, args });
          sendToolCallLine({ broadcaster, name, args, cwd: turnContext.cwd });
          broadcaster.send({ type: "tool.call", name, args, createdAt: nowEventTime() });
        },
        onToolResult: (name, output) => {
          recordWebWorkbenchEvent(options.config.paths.dataDir, currentSession.id, "tool.result", { name, output });
          sendToolResultLine({ broadcaster, name, output, cwd: turnContext.cwd });
          broadcaster.send({ type: "tool.result", name, output, createdAt: nowEventTime() });
        },
        onToolError: (name, error) => {
          recordWebWorkbenchEvent(options.config.paths.dataDir, currentSession.id, "tool.error", { name, error });
          sendToolErrorLine({ broadcaster, name, error, cwd: turnContext.cwd });
          broadcaster.send({ type: "tool.error", name, error, createdAt: nowEventTime() });
        },
        onStatus: (message) => {
          recordWebWorkbenchEvent(options.config.paths.dataDir, currentSession.id, "status", { message });
          broadcaster.send({ type: "session.status", status: "running", message, createdAt: nowEventTime() });
        },
      },
    }).then(async (outcome) => {
      currentSession = await sessionStore.load(outcome.session.id).catch(() => outcome.session);
      running = false;
      activeAbortController = undefined;
      broadcaster.send({ type: "execution.finished", status: outcome.status, createdAt: nowEventTime() });
      if (!assistantDoneSent) {
        broadcaster.send({ type: "assistant.done", createdAt: nowEventTime() });
      }
      broadcaster.send({ type: "session.status", status: outcome.status === "failed" ? "error" : "idle", message: outcome.errorMessage, createdAt: nowEventTime() });
      const nextContext = await loadCurrentWorkbenchContext();
      broadcaster.send({
        type: "project.updated",
        cwd: nextContext.cwd,
        projectName: path.basename(nextContext.cwd),
        createdAt: nowEventTime(),
      });
      broadcaster.send({ type: "git.status", files: await readGitStatus(nextContext.cwd), createdAt: nowEventTime() });
    }).catch((error) => {
      running = false;
      activeAbortController = undefined;
      broadcaster.send({ type: "runtime.error", message: getErrorMessage(error), createdAt: nowEventTime() });
      broadcaster.send({ type: "session.status", status: "error", message: getErrorMessage(error), createdAt: nowEventTime() });
    });
  });

  app.post("/api/session/abort", (_request: Request, response: Response) => {
    if (!running || !activeAbortController) {
      response.json({ ok: true, running: false });
      return;
    }

    activeAbortController.abort(new Error("Turn interrupted from Kitty web workbench."));
    broadcaster.send({ type: "session.status", status: "running", message: "aborting", createdAt: nowEventTime() });
    response.json({ ok: true, running: true });
  });

  wsServer.on("connection", (socket) => {
    socket.send(JSON.stringify({
      type: "server.ready",
      cwd: options.cwd,
      projectName: path.basename(options.cwd),
      sessionId: currentSession.id,
      createdAt: nowEventTime(),
    }));
  });

  const port = await listen(server, host, options.port ?? 0);
  return {
    url: `http://${host}:${port}`,
    close: () => new Promise((resolve, reject) => {
      wsServer.close();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };

  async function loadCurrentWorkbenchContext() {
    return loadWorkbenchTurnContext({
      rootCwd: options.cwd,
      session: currentSession,
    });
  }

  async function refreshCurrentSession(): Promise<SessionRecord> {
    currentSession = await sessionStore.load(currentSession.id).catch(() => currentSession);
    return currentSession;
  }

  function sendWorkbenchRuntimeLine(input: {
    channel: "lead";
    kind: "assistant" | "reasoning";
    message: string;
  }): void {
    const event = createRuntimeLineEvent(input);
    if (event) {
      broadcaster.send(event);
    }
  }
}

async function createWorkbenchSession(input: {
  cwd: string;
  sessionStore: SessionStore;
}): Promise<SessionRecord> {
  return createPersistedSession(input.sessionStore, input.cwd);
}

async function loadWorkbenchTurnContext(input: {
  rootCwd: string;
  session: SessionRecord;
}): Promise<{
  cwd: string;
  stateRootDir?: string;
}> {
  void input.session;
  return { cwd: input.rootCwd };
}

function resolvePackageRootAsset(packageName: string, assetPath: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return path.join(path.dirname(packageJsonPath), assetPath);
}

function resolveWorkbenchAssetDir(): string {
  const candidates = [
    path.resolve("assets", "web-workbench"),
    path.join(path.dirname(process.argv[1] ?? process.cwd()), "..", "assets", "web-workbench"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}

async function handleJson(response: Response, action: () => Promise<unknown>): Promise<void> {
  try {
    response.json(await action());
  } catch (error) {
    response.status(400).json({ error: getErrorMessage(error) });
  }
}

function summarizeSession(session: SessionRecord) {
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    messageCount: session.messageCount,
    updatedAt: session.updatedAt,
    messages: session.messages.slice(-50).map((message) => ({
      role: message.role,
      label: message.role === "assistant" ? formatRuntimeUiRoleLabel("lead", "assistant") : undefined,
      content: message.role === "user" ? readUserInput(message.content) ?? "" : message.content ?? "",
      internal: message.role === "user" && !readUserInput(message.content),
      reasoningContent: message.reasoningContent,
      reasoningLabel: message.role === "assistant" && message.reasoningContent ? formatRuntimeUiRoleLabel("lead", "reasoning") : undefined,
      name: message.name,
      toolCalls: message.tool_calls?.map((toolCall) => ({
        name: toolCall.function.name,
        args: toolCall.function.arguments,
        runtimeLine: createToolCallRuntimeLineSummary({
          channel: "lead",
          name: toolCall.function.name,
          args: toolCall.function.arguments,
          cwd: session.cwd,
        }),
      })),
      createdAt: message.createdAt,
    })).filter((message) => !(message.role === "user" && message.internal)),
  };
}

async function summarizeProject(input: {
  rootCwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
}) {
  const turnContext = await loadWorkbenchTurnContext({
    rootCwd: input.rootCwd,
    session: input.session,
  });
  return {
    cwd: turnContext.cwd,
    rootCwd: input.rootCwd,
    projectName: path.basename(turnContext.cwd),
    model: input.config.model,
    provider: input.config.provider,
    session: summarizeSession(input.session),
  };
}

function listen(server: http.Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not resolve server address."));
        return;
      }
      resolve(address.port);
    });
  });
}

function recordWebWorkbenchEvent(
  rootDir: string,
  sessionId: string,
  event: string,
  details: Record<string, unknown>,
): void {
  recordHostMessage(rootDir, {
    status: "accepted",
    host: "web",
    sessionId,
    details: {
      event,
      ...details,
    },
  });
}
