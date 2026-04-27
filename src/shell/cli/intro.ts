import chalk from "chalk";

import type { ShellOutputPort } from "../../interaction/shell.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";

const DEADMOUSE_BANNER = "DEADMOUSE";

export function writeCliInteractiveIntro(options: {
  cwd: string;
  config: Pick<RuntimeConfig, "agentLane">;
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(DEADMOUSE_BANNER)));
  options.output.dim(`session: ${options.session.id}`);
  options.output.dim(`cwd: ${options.cwd}`);
  options.output.dim(`Agent lane: ${formatAgentLane(options.config.agentLane)}`);
  options.output.dim("Start teammate lane: deadmouse --team");
  options.output.dim("Start subagent lane: deadmouse --subagent");
  options.output.dim("Start all people: deadmouse --allpeople");
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

function formatAgentLane(lane: RuntimeConfig["agentLane"]): string {
  if (lane === "team") {
    return "team";
  }
  if (lane === "subagent") {
    return "subagent";
  }
  if (lane === "allpeople") {
    return "allpeople";
  }
  return "lead";
}
