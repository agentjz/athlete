import { formatTodoBlock } from "../agent/session.js";
import { reconcileBackgroundJobs } from "../background/reconcile.js";
import { BackgroundJobStore } from "../background/store.js";
import { loadProjectContext } from "../context/projectContext.js";
import { resetProjectRuntime } from "../project/reset.js";
import { TaskStore } from "../tasks/store.js";
import { MessageBus } from "../team/messageBus.js";
import { reconcileTeamState } from "../team/reconcile.js";
import { TeamStore } from "../team/store.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { WorktreeStore } from "../worktrees/store.js";
import { formatSessionRuntimeSummary } from "../ui/runtimeSummary.js";
import { buildRuntimePromptDiagnostics } from "../ui/runtimeSummaryData.js";
import type { ShellOutputPort } from "./shell.js";

export interface LocalCommandContext {
  cwd: string;
  session: SessionRecord;
  config: RuntimeConfig;
}

export type LocalCommandResult = "continue" | "handled" | "quit" | "multiline";

const EXIT_COMMANDS = new Set(["q", "quit", "exit", "/q", "/quit", "/exit", "退出", "/退出"]);
const RESET_COMMANDS = new Set(["reset", "/reset", "重置", "/重置"]);
const HELP_COMMANDS = new Set(["/help", "/帮助"]);
const SESSION_COMMANDS = new Set(["/session", "/会话"]);
const CONFIG_COMMANDS = new Set(["/config", "/配置"]);
const TODOS_COMMANDS = new Set(["/todos", "/待办"]);
const RUNTIME_COMMANDS = new Set(["/runtime", "/stats", "/仪表盘"]);
const TASKS_COMMANDS = new Set(["/tasks", "/任务"]);
const TEAM_COMMANDS = new Set(["/team", "/队友"]);
const BACKGROUND_COMMANDS = new Set(["/background", "/后台"]);
const INBOX_COMMANDS = new Set(["/inbox", "/收件箱"]);
const WORKTREES_COMMANDS = new Set(["/worktrees", "/工作区"]);
const MULTILINE_COMMANDS = new Set(["/multi", "/多行"]);

export function isExplicitExitCommand(input: string): boolean {
  return EXIT_COMMANDS.has(input.trim().toLowerCase());
}

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return "handled";
  }

  if (isExplicitExitCommand(normalized)) {
    return "quit";
  }

  if (RESET_COMMANDS.has(normalized)) {
    await resetProjectRuntime({
      cwd: context.cwd,
      config: context.config,
      currentSessionId: context.session.id,
    });
    output.warn("Project runtime reset. Session closed.");
    return "quit";
  }

  if (HELP_COMMANDS.has(normalized)) {
    output.plain(
      [
        "/help /帮助        查看帮助",
        "/session /会话     查看当前会话 ID",
        "/config /配置      查看当前运行配置",
        "/todos /待办       查看当前 todo 状态",
        "/runtime /stats    查看当前 session 运行仪表盘摘要",
        "/tasks /任务       查看持久化任务板",
        "/team /队友        查看队友状态",
        "/background /后台  查看后台任务",
        "/worktrees /工作区 查看隔离工作区",
        "/inbox /收件箱     查看 lead 收件箱（不清空）",
        "/multi /多行       进入多行输入模式，用 ::end 提交，::cancel 取消",
        "/reset /重置      清空当前项目运行时状态并退出会话",
        "quit / 退出        退出会话",
        "q                  退出会话",
        "/quit / /exit      退出会话",
        "",
        "其他输入会直接发送给 Athlete。",
      ].join("\n"),
    );
    return "handled";
  }

  if (MULTILINE_COMMANDS.has(normalized)) {
    return "multiline";
  }

  if (SESSION_COMMANDS.has(normalized)) {
    output.info(`Current session: ${context.session.id}`);
    return "handled";
  }

  if (CONFIG_COMMANDS.has(normalized)) {
    output.info(`model=${context.config.model} mode=${context.config.mode} baseUrl=${context.config.baseUrl}`);
    return "handled";
  }

  if (TODOS_COMMANDS.has(normalized)) {
    output.plain(formatTodoBlock(context.session.todoItems));
    return "handled";
  }

  if (RUNTIME_COMMANDS.has(normalized)) {
    const promptDiagnostics = await buildRuntimePromptDiagnostics({
      cwd: context.cwd,
      session: context.session,
      config: context.config,
    });
    output.plain(formatSessionRuntimeSummary(context.session, { promptDiagnostics }));
    return "handled";
  }

  if (
    TASKS_COMMANDS.has(normalized) ||
    TEAM_COMMANDS.has(normalized) ||
    BACKGROUND_COMMANDS.has(normalized) ||
    INBOX_COMMANDS.has(normalized) ||
    WORKTREES_COMMANDS.has(normalized)
  ) {
    const projectContext = await loadProjectContext(context.cwd);
    const rootDir = projectContext.stateRootDir;

    if (TASKS_COMMANDS.has(normalized)) {
      await reconcileTeamState(rootDir).catch(() => null);
      output.plain(await new TaskStore(rootDir).summarize());
      return "handled";
    }

    if (TEAM_COMMANDS.has(normalized)) {
      await reconcileTeamState(rootDir).catch(() => null);
      output.plain(await new TeamStore(rootDir).summarizeMembers());
      return "handled";
    }

    if (BACKGROUND_COMMANDS.has(normalized)) {
      await reconcileBackgroundJobs(rootDir).catch(() => null);
      output.plain(await new BackgroundJobStore(rootDir).summarize());
      return "handled";
    }

    if (WORKTREES_COMMANDS.has(normalized)) {
      output.plain(await new WorktreeStore(rootDir).summarize());
      return "handled";
    }

    const inbox = await new MessageBus(rootDir).peekInbox("lead");
    output.plain(
      inbox.length > 0
        ? inbox
            .slice(0, 20)
            .map((message) => `${message.type} from ${message.from}: ${message.content}`)
            .join("\n")
        : "Inbox empty.",
    );
    return "handled";
  }

  return "continue";
}
