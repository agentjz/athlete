import fs from "node:fs";

let stdoutBroken = false;
let stderrBroken = false;
let guardsInstalled = false;

export function installStdioGuards(): void {
  if (guardsInstalled) {
    return;
  }

  guardsInstalled = true;

  process.stdout.on("error", (error) => {
    if (isIgnorableStreamError(error)) {
      stdoutBroken = true;
      return;
    }

    throw error;
  });

  process.stderr.on("error", (error) => {
    if (isIgnorableStreamError(error)) {
      stderrBroken = true;
      return;
    }

    throw error;
  });
}

export function writeStdout(text: string): boolean {
  return writeToFd(1, text, "stdout");
}

export function writeStdoutLine(text = ""): boolean {
  return writeStdout(`${text}\n`);
}

export function writeStderr(text: string): boolean {
  return writeToFd(2, text, "stderr");
}

export function writeStderrLine(text = ""): boolean {
  return writeStderr(`${text}\n`);
}

function writeToFd(fd: number, text: string, stream: "stdout" | "stderr"): boolean {
  if (stream === "stdout" ? stdoutBroken : stderrBroken) {
    return false;
  }

  const target = stream === "stdout" ? process.stdout : process.stderr;

  try {
    if (target.isTTY) {
      return target.write(text);
    }

    fs.writeSync(fd, text, undefined, "utf8");
    return true;
  } catch (error) {
    if (isIgnorableStreamError(error)) {
      if (stream === "stdout") {
        stdoutBroken = true;
      } else {
        stderrBroken = true;
      }
      return false;
    }

    throw error;
  }
}

function isIgnorableStreamError(error: unknown): boolean {
  const code = String((error as { code?: unknown }).code ?? "");
  return code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END";
}
