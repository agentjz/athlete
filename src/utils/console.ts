import chalk from "chalk";
import { writeStderrLine, writeStdoutLine } from "./stdio.js";

const ANSI_RESET = "\x1b[0m";

export const ui = {
  info(message: string): void {
    writeStdoutLine(`${chalk.cyan("[i]")} ${message}`);
  },
  success(message: string): void {
    writeStdoutLine(`${chalk.green("[ok]")} ${message}`);
  },
  warn(message: string): void {
    writeStdoutLine(`${chalk.yellow("!")} ${message}`);
  },
  error(message: string): void {
    writeStderrLine(`${chalk.red("[x]")} ${message}`);
  },
  tool(message: string): void {
    writeStdoutLine(`${chalk.magenta("[tool]")} ${message}`);
  },
  dispatch(message: string): void {
    writeStdoutLine(`${chalk.magenta("[dispatch]")} ${message}`);
  },
  dim(message: string): void {
    writeStdoutLine(`${chalk.gray(message)}${ANSI_RESET}`);
  },
  heading(message: string): void {
    writeStdoutLine(chalk.bold(message));
  },
  plain(message: string): void {
    writeStdoutLine(message);
  },
};
