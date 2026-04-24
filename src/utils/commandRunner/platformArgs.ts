export function splitByAndAnd(command: string): string[] {
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

export function joinWithAndSemantics(segments: string[]): string {
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

export function splitArgs(command: string): string[] {
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

export function expandPaths(paths: string[]): string[] {
  return paths.flatMap((targetPath) => expandBraces(targetPath));
}

export function normalizeWindowsPath(value: string): string {
  if (value.includes("://")) {
    return value;
  }
  return value.replace(/\//g, "\\");
}

export function quotePowerShell(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
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
