import { classifyValidationCommand } from "./validation.js";

export type CommandKind = "read_only" | "mutating" | "long_running" | "validation" | "unknown";

export interface CommandClassification {
  kind: CommandKind;
  validationKind?: string;
  isReadOnly: boolean;
  isMutating: boolean;
  isLongRunning: boolean;
  requiresPlan: boolean;
  preferBackground: boolean;
  retryable: boolean;
}

const READ_ONLY_PATTERNS: RegExp[] = [
  /^\s*(ls|dir|pwd|cd)\b/i,
  /^\s*(cat|type|more|less)\b/i,
  /^\s*(rg|grep|find)\b/i,
  /^\s*git\s+(status|diff|log|show|branch)\b/i,
  /^\s*(whoami|where|which)\b/i,
  /^\s*(node|python|pip|java|go|rustc|cargo|npm|pnpm|yarn)\b.*--version\b/i,
  /^\s*(node|python|pip|java|go|rustc|cargo|npm|pnpm|yarn)\b.*-v\b/i,
];

const MUTATING_PATTERNS: RegExp[] = [
  /^\s*(rm|del|erase)\b/i,
  /^\s*(mv|move|ren|rename|copy|cp)\b/i,
  /^\s*(mkdir|rmdir|rd)\b/i,
  /^\s*touch\b/i,
  /^\s*git\s+(checkout|switch|add|reset|clean|commit|merge|rebase|cherry-pick|stash)\b/i,
  /^\s*(npm|pnpm|yarn)\b.*\b(init|install|ci)\b/i,
  /^\s*(pip|poetry|conda)\b.*\binstall\b/i,
  /^\s*(brew|apt-get|apt|yum|dnf)\b.*\binstall\b/i,
];

const LONG_RUNNING_PATTERNS: RegExp[] = [
  /^\s*(npm|pnpm|yarn)\b.*\b(install|ci|run\s+build|run\s+test)\b/i,
  /^\s*(pip|poetry|conda)\b.*\binstall\b/i,
  /^\s*(pytest|go\s+test|cargo\s+test|cargo\s+build|mvn|gradle)\b/i,
  /^\s*(docker\s+build|docker\s+pull)\b/i,
  /^\s*git\s+clone\b/i,
];

export function classifyCommand(command: string): CommandClassification {
  const normalized = command.trim();
  const validationKind = classifyValidationCommand(normalized);
  const isReadOnly = READ_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
  const isMutating = MUTATING_PATTERNS.some((pattern) => pattern.test(normalized));
  const isLongRunning =
    Boolean(validationKind) || LONG_RUNNING_PATTERNS.some((pattern) => pattern.test(normalized));

  let kind: CommandKind = "unknown";
  if (validationKind) {
    kind = "validation";
  } else if (isReadOnly) {
    kind = "read_only";
  } else if (isMutating) {
    kind = "mutating";
  } else if (isLongRunning) {
    kind = "long_running";
  }

  return {
    kind,
    validationKind,
    isReadOnly,
    isMutating,
    isLongRunning,
    requiresPlan: !isReadOnly && !validationKind,
    preferBackground: isLongRunning && !validationKind,
    retryable: isReadOnly || Boolean(validationKind),
  };
}
