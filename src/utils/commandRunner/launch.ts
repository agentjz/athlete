import { execa } from "execa";

export function launchCommand(command: string, cwd: string, timeoutMs: number, abortSignal?: AbortSignal) {
  return process.platform === "win32"
    ? execa("powershell.exe", ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(command)], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        reject: false,
        env: buildCommandEnvironment(),
      })
    : execa("/bin/bash", ["-lc", command], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        reject: false,
        env: buildCommandEnvironment(),
      });
}

function encodePowerShellCommand(command: string): string {
  const wrapped = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    "try { chcp 65001 > $null } catch { }",
    `& { ${command} }`,
    "$code = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } elseif ($?) { 0 } else { 1 }",
    "exit $code",
  ].join("; ");
  return Buffer.from(wrapped, "utf16le").toString("base64");
}

function buildCommandEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "C.UTF-8",
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
  };
}
