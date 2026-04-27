import { formatTodoBlock } from "../agent/session.js";
import { reconcileBackgroundJobs, BackgroundJobStore } from "../execution/background.js";
import { reconcileActiveExecutions } from "../execution/reconcile.js";
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

const EXIT_COMMANDS = new Set(["q", "quit", "exit", "/q", "/quit", "/exit"]);
const RESET_COMMANDS = new Set(["reset", "/reset"]);
const HELP_COMMANDS = new Set(["/help"]);
const SESSION_COMMANDS = new Set(["/session"]);
const CONFIG_COMMANDS = new Set(["/config"]);
const TODOS_COMMANDS = new Set(["/todos"]);
const RUNTIME_COMMANDS = new Set(["/runtime", "/stats"]);
const TASKS_COMMANDS = new Set(["/tasks"]);
const TEAM_COMMANDS = new Set(["/team"]);
const BACKGROUND_COMMANDS = new Set(["/background"]);
const INBOX_COMMANDS = new Set(["/inbox"]);
const WORKTREES_COMMANDS = new Set(["/worktrees"]);
const MULTILINE_COMMANDS = new Set(["/multi"]);

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
        "/help        Show help",
        "/session     Show current session ID",
        "/config      Show current runtime config",
        "/todos       Show current todo state",
        "/runtime     Show current session runtime summary",
        "/tasks       Show persistent task board",
        "/team        Show teammate state",
        "/background  Show background jobs",
        "/worktrees   Show isolated worktrees",
        "/inbox       Show Lead inbox without clearing it",
        "/multi       Enter multiline input; use ::end to submit and ::cancel to cancel",
        "/reset       Clear current project runtime state and exit",
        "quit         Exit the session",
        "q            Exit the session",
        "/quit /exit  Exit the session",
        "",
        "Any other input is sent directly to Deadmouse.",
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
    output.info(`model=${context.config.model} lane=${context.config.agentLane} baseUrl=${context.config.baseUrl}`);
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
    await reconcileActiveExecutions(rootDir).catch(() => null);

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
