import chalk from "chalk";
import figlet from "figlet";

import type { ShellOutputPort } from "../../interaction/shell.js";
import type { SessionRecord } from "../../types.js";

const KITTY_WORDMARK_FONT = "ANSI Shadow";

function renderKittyBanner(): string {
  return figlet
    .textSync("kitty agent", {
      font: KITTY_WORDMARK_FONT,
      horizontalLayout: "default",
      verticalLayout: "default",
      width: 120,
      whitespaceBreak: false,
    })
    .trimEnd();
}

export function writeCliInteractiveIntro(options: {
  cwd: string;
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(renderKittyBanner())));
  options.output.dim(`session: ${options.session.id}`);
  options.output.dim(`cwd: ${options.cwd}`);
  options.output.dim("Tools: read, edit, write, bash");
  options.output.dim("Commands:");
  options.output.dim("/help        Show help");
  options.output.dim("/multi       Enter multiline input");
  options.output.dim("/reset       Reset runtime and exit");
  options.output.dim("quit         Exit");
  options.output.dim("::end        Submit multiline input");
  options.output.dim("::cancel     Cancel multiline input\n");
}
