import {
  expandPaths,
  normalizeWindowsPath,
  quotePowerShell,
  splitArgs,
} from "./platformArgs.js";

export function startsWithExplicitShell(command: string): boolean {
  return /^\s*(cmd(?:\.exe)?\s+\/c|powershell(?:\.exe)?\b|pwsh\b|bash\b)/i.test(command);
}

export function normalizeWindowsSegment(segment: string): string {
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
  const targetPath = paths[0];

  let command = "Get-ChildItem";
  if (force) {
    command += " -Force";
  }
  if (targetPath) {
    command += ` -LiteralPath ${quotePowerShell(normalizeWindowsPath(targetPath))}`;
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

  const needsNormalization = hasParents || paths.some((targetPath) => targetPath.includes("{"));
  if (!needsNormalization) {
    return segment;
  }

  const expanded = expandPaths(paths);
  if (expanded.length === 0) {
    return segment;
  }

  const normalizedPaths = expanded.map((targetPath) => quotePowerShell(normalizeWindowsPath(targetPath)));
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

  command += ` -LiteralPath ${paths.map((targetPath) => quotePowerShell(normalizeWindowsPath(targetPath))).join(", ")}`;
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

  command += ` -Path ${sources.map((targetPath) => quotePowerShell(normalizeWindowsPath(targetPath))).join(", ")}`;
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

  command += ` -Path ${sources.map((targetPath) => quotePowerShell(normalizeWindowsPath(targetPath))).join(", ")}`;
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

  const paths = expanded.map((targetPath) => quotePowerShell(normalizeWindowsPath(targetPath)));
  return `New-Item -ItemType File -Force -Path ${paths.join(", ")}`;
}

function normalizeCatSegment(segment: string): string {
  const args = splitArgs(segment).slice(1);
  if (args.length === 0) {
    return segment;
  }

  const targetPath = args[0];
  if (!targetPath) {
    return segment;
  }
  return `Get-Content -LiteralPath ${quotePowerShell(normalizeWindowsPath(targetPath))}`;
}
