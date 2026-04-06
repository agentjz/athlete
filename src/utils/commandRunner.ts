import { execa } from "execa";

import { truncateText } from "./fs.js";

export interface CommandRunOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  stallTimeoutMs: number;
  abortSignal?: AbortSignal;
  maxRetries: number;
  retryBackoffMs: number;
  canRetry: boolean;
}

export interface CommandRunResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  stalled: boolean;
  attempts: number;
  durationMs: number;
}

const MAX_OUTPUT_CHARS = 12_000;
const STALL_KILL_TIMEOUT_MS = 5_000;

export async function runCommandWithPolicy(options: CommandRunOptions): Promise<CommandRunResult> {
  const attempts = Math.max(1, Math.trunc(options.maxRetries) + 1);
  let lastResult: CommandRunResult | null = null;
  const normalizedCommand = normalizeCommandForPlatform(options.command);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await runCommandOnce({
      ...options,
      command: normalizedCommand,
    });

    const success = lastResult.exitCode === 0 && !lastResult.timedOut && !lastResult.stalled;
    if (success) {
      return lastResult;
    }

    if (!options.canRetry || attempt >= attempts) {
      return lastResult;
    }

    await sleep(options.retryBackoffMs * attempt, options.abortSignal);
  }

  return lastResult ?? {
    exitCode: null,
    output: "",
    timedOut: false,
    stalled: false,
    attempts: 0,
    durationMs: 0,
  };
}

async function runCommandOnce(options: CommandRunOptions): Promise<CommandRunResult> {
  const start = Date.now();
  let stalled = false;
  let stallTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const subprocess = launchCommand(options.command, options.cwd, options.timeoutMs, options.abortSignal);

  const clearTimers = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const resetStallTimer = () => {
    if (stalled) {
      return;
    }

    if (stallTimer) {
      clearTimeout(stallTimer);
    }

    if (options.stallTimeoutMs > 0) {
      stallTimer = setTimeout(() => {
        stalled = true;
        try {
          subprocess.kill("SIGTERM");
        } catch {
          // ignore
        }
        if (STALL_KILL_TIMEOUT_MS > 0) {
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => {
            try {
              if (typeof subprocess.exitCode !== "number") {
                subprocess.kill("SIGKILL");
              }
            } catch {
              // ignore
            }
          }, STALL_KILL_TIMEOUT_MS);
        }
      }, options.stallTimeoutMs);
    }
  };

  resetStallTimer();

  if (subprocess.all) {
    subprocess.all.on("data", resetStallTimer);
  }

  try {
    const result = await subprocess;
    clearTimers();

    return {
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      output: truncateText(result.all ?? "", MAX_OUTPUT_CHARS),
      timedOut: Boolean((result as { timedOut?: unknown }).timedOut),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    clearTimers();

    return {
      exitCode: readExitCode(error),
      output: truncateText(readProcessOutput(error), MAX_OUTPUT_CHARS),
      timedOut: isTimedOutError(error),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  }
}

function launchCommand(command: string, cwd: string, timeoutMs: number, abortSignal?: AbortSignal) {
  return process.platform === "win32"
    ? execa("powershell.exe", ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(command)], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        reject: false,
      })
    : execa("/bin/bash", ["-lc", command], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        reject: false,
      });
}

function encodePowerShellCommand(command: string): string {
  const wrapped = [
    "$ProgressPreference = 'SilentlyContinue'",
    `& { ${command} }`,
    "$code = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } elseif ($?) { 0 } else { 1 }",
    "exit $code",
  ].join("; ");
  return Buffer.from(wrapped, "utf16le").toString("base64");
}

function normalizeCommandForPlatform(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return command;
  }

  const normalized = normalizeWindowsCommand(trimmed);
  return normalizeNpmShims(normalized);
}

function normalizeWindowsCommand(command: string): string {
  if (startsWithExplicitShell(command)) {
    return command;
  }

  const segments = splitByAndAnd(command);
  const normalizedSegments = segments.map((segment) => normalizeWindowsSegment(segment));
  return joinWithAndSemantics(normalizedSegments);
}

function startsWithExplicitShell(command: string): boolean {
  return /^\s*(cmd(?:\.exe)?\s+\/c|powershell(?:\.exe)?\b|pwsh\b|bash\b)/i.test(command);
}

function splitByAndAnd(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble && char === "&" && command.charAt(index + 1) === "&") {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      index += 1;
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments.length > 0 ? segments : [command];
}

function joinWithAndSemantics(segments: string[]): string {
  if (segments.length <= 1) {
    return segments[0] ?? "";
  }

  let script = segments[0] ?? "";
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    script += `; if ($?) { ${segment} }`;
  }

  return script;
}

function normalizeWindowsSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) {
    return segment;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("get-childitem") || lowered.startsWith("new-item")) {
    return segment;
  }

  if (lowered.startsWith("ls")) {
    return normalizeLsSegment(trimmed);
  }
  if (lowered.startsWith("mkdir") || lowered.startsWith("md ")) {
    return normalizeMkdirSegment(trimmed);
  }
  if (lowered.startsWith("rm ")) {
    return normalizeRemoveSegment(trimmed);
  }
  if (lowered.startsWith("cp ")) {
    return normalizeCopySegment(trimmed);
  }
  if (lowered.startsWith("mv ")) {
    return normalizeMoveSegment(trimmed);
  }
  if (lowered.startsWith("touch ")) {
    return normalizeTouchSegment(trimmed);
  }
  if (lowered.startsWith("cat ")) {
    return normalizeCatSegment(trimmed);
  }

  return segment;
}

function normalizeLsSegment(segment: string): string {
  const args = splitArgs(segment).slice(1);
  const flags = args.filter((arg) => arg.startsWith("-"));
  const paths = args.filter((arg) => !arg.startsWith("-"));
  const force = flags.some((flag) => flag.includes("a"));
  const path = paths[0];

  let command = "Get-ChildItem";
  if (force) {
    command += " -Force";
  }
  if (path) {
    command += ` -LiteralPath ${quotePowerShell(normalizeWindowsPath(path))}`;
  }

  return command;
}

function normalizeMkdirSegment(segment: string): string {
  const args = splitArgs(segment);
  if (args.length <= 1) {
    return segment;
  }

  const rest = args.slice(1);
  let hasParents = false;
  const paths = rest.filter((arg) => {
    const lowered = arg.toLowerCase();
    if (lowered === "-p" || lowered === "--parents") {
      hasParents = true;
      return false;
    }
    return true;
  });

  const needsNormalization = hasParents || paths.some((path) => path.includes("{"));
  if (!needsNormalization) {
    return segment;
  }

  const expanded = expandPaths(paths);
  if (expanded.length === 0) {
    return segment;
  }

  const normalizedPaths = expanded.map((path) => quotePowerShell(normalizeWindowsPath(path)));
  return `New-Item -ItemType Directory -Force -Path ${normalizedPaths.join(", ")}`;
}

function normalizeRemoveSegment(segment: string): string {
  const args = splitArgs(segment);
  if (args.length <= 1) {
    return segment;
  }

  const flags = args.slice(1).filter((arg) => arg.startsWith("-"));
  const paths = args.slice(1).filter((arg) => !arg.startsWith("-"));
  if (paths.length === 0) {
    return segment;
  }

  const recurse = flags.some((flag) => /r/i.test(flag));
  const force = flags.some((flag) => /f/i.test(flag));

  let command = "Remove-Item";
  if (recurse) {
    command += " -Recurse";
  }
  if (force) {
    command += " -Force";
  }

  command += ` -LiteralPath ${paths.map((path) => quotePowerShell(normalizeWindowsPath(path))).join(", ")}`;
  return command;
}

function normalizeCopySegment(segment: string): string {
  const args = splitArgs(segment);
  if (args.length < 3) {
    return segment;
  }

  const flags = args.slice(1).filter((arg) => arg.startsWith("-"));
  const paths = args.slice(1).filter((arg) => !arg.startsWith("-"));
  if (paths.length < 2) {
    return segment;
  }

  const recurse = flags.some((flag) => /r/i.test(flag));
  const force = flags.some((flag) => /f/i.test(flag));
  const destination = paths[paths.length - 1];
  if (!destination) {
    return segment;
  }
  const sources = paths.slice(0, -1);

  let command = "Copy-Item";
  if (recurse) {
    command += " -Recurse";
  }
  if (force) {
    command += " -Force";
  }

  command += ` -Path ${sources.map((path) => quotePowerShell(normalizeWindowsPath(path))).join(", ")}`;
  command += ` -Destination ${quotePowerShell(normalizeWindowsPath(destination))}`;
  return command;
}

function normalizeMoveSegment(segment: string): string {
  const args = splitArgs(segment);
  if (args.length < 3) {
    return segment;
  }

  const flags = args.slice(1).filter((arg) => arg.startsWith("-"));
  const paths = args.slice(1).filter((arg) => !arg.startsWith("-"));
  if (paths.length < 2) {
    return segment;
  }

  const force = flags.some((flag) => /f/i.test(flag));
  const destination = paths[paths.length - 1];
  if (!destination) {
    return segment;
  }
  const sources = paths.slice(0, -1);

  let command = "Move-Item";
  if (force) {
    command += " -Force";
  }

  command += ` -Path ${sources.map((path) => quotePowerShell(normalizeWindowsPath(path))).join(", ")}`;
  command += ` -Destination ${quotePowerShell(normalizeWindowsPath(destination))}`;
  return command;
}

function normalizeTouchSegment(segment: string): string {
  const args = splitArgs(segment).slice(1);
  if (args.length === 0) {
    return segment;
  }

  const expanded = expandPaths(args);
  if (expanded.length === 0) {
    return segment;
  }

  const paths = expanded.map((path) => quotePowerShell(normalizeWindowsPath(path)));
  return `New-Item -ItemType File -Force -Path ${paths.join(", ")}`;
}

function normalizeCatSegment(segment: string): string {
  const args = splitArgs(segment).slice(1);
  if (args.length === 0) {
    return segment;
  }

  const path = args[0];
  if (!path) {
    return segment;
  }
  return `Get-Content -LiteralPath ${quotePowerShell(normalizeWindowsPath(path))}`;
}

function normalizeNpmShims(command: string): string {
  const shims: Record<string, string> = {
    npm: "npm.cmd",
    npx: "npx.cmd",
    pnpm: "pnpm.cmd",
    yarn: "yarn.cmd",
  };

  const pattern = /(^|[;&|]|\&\&)\s*(npm|npx|pnpm|yarn)(?=\s|$)/gi;
  return command.replace(pattern, (match, prefix, tool) => {
    const replacement = shims[String(tool).toLowerCase()];
    if (!replacement) {
      return match;
    }
    if (!prefix) {
      return replacement;
    }
    return `${prefix} ${replacement}`;
  });
}

function splitArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function expandPaths(paths: string[]): string[] {
  return paths.flatMap((path) => expandBraces(path));
}

function expandBraces(input: string): string[] {
  const start = findBraceStart(input);
  if (start === -1) {
    return [input];
  }

  const end = findMatchingBrace(input, start);
  if (end === -1) {
    return [input];
  }

  const prefix = input.slice(0, start);
  const suffix = input.slice(end + 1);
  const body = input.slice(start + 1, end);
  const parts = splitBraceParts(body);
  const expandedSuffix = expandBraces(suffix);

  const results: string[] = [];
  for (const part of parts) {
    for (const expandedPart of expandBraces(part)) {
      for (const tail of expandedSuffix) {
        results.push(`${prefix}${expandedPart}${tail}`);
      }
    }
  }

  return results;
}

function findBraceStart(input: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "{") {
      return index;
    }
  }
  return -1;
}

function findMatchingBrace(input: string, start: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === "\"" && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitBraceParts(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [input];
}

function normalizeWindowsPath(value: string): string {
  if (value.includes("://")) {
    return value;
  }
  return value.replace(/\//g, "\\");
}

function quotePowerShell(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

function readExitCode(error: unknown): number | null {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : null;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Command failed.";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error("Command retry aborted."));
        },
        { once: true },
      );
    }
  });
}
