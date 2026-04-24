import chalk from "chalk";

import type { ShellOutputPort } from "../../interaction/shell.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";

const DEADMOUSE_BANNER = [
  "██████╗ ███████╗  █████╗ ██████╗ ███╗   ███╗  ██████╗ ██╗   ██╗ ███████╗ ███████╗",
  "██╔══██╗██╔════╝ ██╔══██╗██╔══██╗████╗ ████║ ██╔═══██╗██║   ██║ ██╔════╝ ██╔════╝",
  "██║  ██║█████╗   ███████║██║  ██║██╔████╔██║ ██║   ██║██║   ██║ ███████╗ █████╗  ",
  "██║  ██║██╔══╝   ██╔══██║██║  ██║██║╚██╔╝██║ ██║   ██║██║   ██║ ╚════██║ ██╔══╝  ",
  "██████╔╝███████╗ ██║  ██║██████╔╝██║ ╚═╝ ██║ ╚██████╔╝╚██████╔╝ ███████║ ███████╗",
  "╚═════╝ ╚══════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝  ╚═════╝  ╚═════╝  ╚══════╝ ╚══════╝",
].join("\n");

export function writeCliInteractiveIntro(options: {
  cwd: string;
  config: Pick<RuntimeConfig, "mode">;
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(DEADMOUSE_BANNER)));
  options.output.dim(`session: ${options.session.id}`);
  options.output.dim(`cwd: ${options.cwd}`);

  const modeLabel = options.config.mode === "agent" ? "agent" : "read-only";
  const modeSwitchHint = options.config.mode === "agent" ? "deadmouse --mode read-only" : "deadmouse --mode agent";
  options.output.dim(`Current mode: ${modeLabel}`);
  options.output.dim(`Switch mode: ${modeSwitchHint}`);
  options.output.dim("Commands:");
  options.output.dim("/help        查看帮助");
  options.output.dim("/runtime     查看会话运行摘要");
  options.output.dim("/multi       进入多行输入");
  options.output.dim("/tasks       查看任务板");
  options.output.dim("/team        查看队友状态");
  options.output.dim("/background  查看后台任务");
  options.output.dim("/worktrees   查看工作区");
  options.output.dim("/inbox       查看收件箱");
  options.output.dim("/reset       重置运行时并退出");
  options.output.dim("quit         退出");
  options.output.dim("::end        提交多行输入");
  options.output.dim("::cancel     取消多行输入\n");
}
