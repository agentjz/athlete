import path from "node:path";

import type { ExtensionManifest } from "./manifest.js";

export interface ExtensionWorkspace {
  extensionId: string;
  root: string;
}

export function resolveExtensionWorkspace(cwd: string, manifest: ExtensionManifest): ExtensionWorkspace {
  return {
    extensionId: manifest.id,
    root: path.join(cwd, manifest.workspace.root),
  };
}

export function resolveExtensionSessionWorkspace(
  cwd: string,
  manifest: ExtensionManifest,
  sessionId: string,
): ExtensionWorkspace {
  return {
    extensionId: manifest.id,
    root: path.join(cwd, ".kitty", manifest.workspace.root, normalizeWorkspaceSegment(sessionId)),
  };
}

function normalizeWorkspaceSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Extension session workspace segment cannot be empty.");
  }
  return normalized;
}
