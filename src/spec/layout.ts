import path from "node:path";

import { getProjectStatePaths } from "../project/statePaths.js";
import type { SpecDocumentName } from "./types.js";

export interface SpecPaths {
  stateRootDir: string;
  specsDir: string;
  workspacesDir: string;
  sessionsDir: string;
  specDir: string;
  stateFile: string;
  checkpointsDir: string;
  artifactsDir: string;
  documents: Record<SpecDocumentName, string>;
}

export function getSpecRootDir(stateRootDir: string): string {
  return path.join(getProjectStatePaths(stateRootDir).kittyDir, "specs");
}

export function getSpecSessionBindingsDir(stateRootDir: string): string {
  return path.join(getSpecRootDir(stateRootDir), "sessions");
}

export function getSpecWorkspacesDir(stateRootDir: string): string {
  return path.join(getSpecRootDir(stateRootDir), "workspaces");
}

export function getSpecPaths(stateRootDir: string, specId: string): SpecPaths {
  const specsDir = getSpecRootDir(stateRootDir);
  const specDir = path.join(specsDir, "changes", specId);
  return {
    stateRootDir,
    specsDir,
    workspacesDir: getSpecWorkspacesDir(stateRootDir),
    sessionsDir: getSpecSessionBindingsDir(stateRootDir),
    specDir,
    stateFile: path.join(specDir, "state.json"),
    checkpointsDir: path.join(specDir, "checkpoints"),
    artifactsDir: path.join(specDir, "artifacts"),
    documents: {
      requirements: path.join(specDir, "requirements.md"),
      design: path.join(specDir, "design.md"),
      tasks: path.join(specDir, "tasks.md"),
      notes: path.join(specDir, "notes.md"),
    },
  };
}

export function getSpecSessionBindingFile(stateRootDir: string, sessionId: string): string {
  return path.join(getSpecSessionBindingsDir(stateRootDir), `${sanitizeFileSegment(sessionId)}.json`);
}

export function sanitizeSpecIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "spec";
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
