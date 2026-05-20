import type { AppConfig } from "../types.js";

export const EXTENSION_IDS = ["todo", "worktree", "network", "spec"] as const;

export type ExtensionId = (typeof EXTENSION_IDS)[number];

export interface ExtensionToggleConfig {
  todo: boolean;
  worktree: boolean;
  network: boolean;
  spec: boolean;
}

const DEFAULT_EXTENSIONS: ExtensionToggleConfig = {
  todo: true,
  worktree: false,
  network: false,
  spec: false,
};

export function getDefaultExtensions(): ExtensionToggleConfig {
  return { ...DEFAULT_EXTENSIONS };
}

export function normalizeExtensions(value: unknown): ExtensionToggleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultExtensions();
  }

  const record = value as Record<string, unknown>;
  return {
    todo: readBoolean(record.todo, DEFAULT_EXTENSIONS.todo),
    worktree: readBoolean(record.worktree, DEFAULT_EXTENSIONS.worktree),
    network: readBoolean(record.network, DEFAULT_EXTENSIONS.network),
    spec: readBoolean(record.spec, DEFAULT_EXTENSIONS.spec),
  };
}

export function mergeExtensions(
  current: ExtensionToggleConfig,
  patch: Partial<ExtensionToggleConfig> | undefined,
): ExtensionToggleConfig {
  if (!patch) {
    return { ...current };
  }
  return normalizeExtensions({
    ...current,
    ...patch,
  });
}

export function readEnabledExtensionIds(config: Pick<AppConfig, "extensions">): ExtensionId[] {
  return EXTENSION_IDS.filter((id) => config.extensions[id]);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
