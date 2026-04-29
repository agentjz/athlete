import chalk from "chalk";

import type { ShellOutputPort } from "../../interaction/shell.js";
import type { SessionRecord } from "../../types.js";

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
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(DEADMOUSE_BANNER)));
  options.output.dim(`session: ${options.session.id}`);
  options.output.dim(`cwd: ${options.cwd}`);
  options.output.dim("Capabilities: unified protocol surface (use /runtime to inspect current exposure)");
  options.output.dim("Commands:");
  options.output.dim("/help        Show help");
  options.output.dim("/runtime     Show runtime summary");
  options.output.dim("/multi       Enter multiline input");
  options.output.dim("/tasks       Show task board");
  options.output.dim("/team        Show teammate state");
  options.output.dim("/background  Show background jobs");
  options.output.dim("/worktrees   Show worktrees");
  options.output.dim("/inbox       Show inbox");
  options.output.dim("/reset       Reset runtime and exit");
  options.output.dim("quit         Exit");
  options.output.dim("::end        Submit multiline input");
  options.output.dim("::cancel     Cancel multiline input\n");
}
