import fs from "node:fs/promises";
import path from "node:path";

import {
  readJsonFile,
  sanitizeStateSegment,
  sessionExtensionDir,
  writeJsonFile,
} from "../../shared.js";

export type SpecStatus = "draft" | "active" | "blocked" | "completed";
export type SpecTaskStatus = "pending" | "in_progress" | "completed";

export interface SpecTaskRecord {
  id: string;
  text: string;
  status: SpecTaskStatus;
}

export interface SpecNoteRecord {
  at: string;
  text: string;
}

export interface SpecCheckpointRecord {
  id: string;
  label: string;
  createdAt: string;
  document: string;
  state: SpecState;
}

export interface SpecState {
  schemaVersion: 1;
  id: string;
  title: string;
  status: SpecStatus;
  updatedAt: string;
  notes: SpecNoteRecord[];
  tasks: SpecTaskRecord[];
}

export function createEmptySpecState(sessionId: string): SpecState {
  return {
    schemaVersion: 1,
    id: sanitizeStateSegment(sessionId),
    title: "Untitled spec",
    status: "draft",
    updatedAt: new Date(0).toISOString(),
    notes: [],
    tasks: [],
  };
}

export async function readSpecState(rootDir: string, sessionId: string): Promise<SpecState> {
  return normalizeSpecState(
    await readJsonFile(await specStateFile(rootDir, sessionId), createEmptySpecState(sessionId)),
    sessionId,
  );
}

export async function writeSpecState(rootDir: string, sessionId: string, state: SpecState): Promise<string> {
  const filePath = await specStateFile(rootDir, sessionId);
  await writeJsonFile(filePath, normalizeSpecState({
    ...state,
    updatedAt: new Date().toISOString(),
  }, sessionId));
  return filePath;
}

export async function readSpecDocument(rootDir: string, sessionId: string): Promise<string> {
  return fs.readFile(await specDocumentFile(rootDir, sessionId), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  });
}

export async function writeSpecDocument(rootDir: string, sessionId: string, content: string): Promise<string> {
  const filePath = await specDocumentFile(rootDir, sessionId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

export async function specDocumentFile(rootDir: string, sessionId: string): Promise<string> {
  return path.join(await specSessionDir(rootDir, sessionId), "spec.md");
}

export async function specStateFile(rootDir: string, sessionId: string): Promise<string> {
  return path.join(await specSessionDir(rootDir, sessionId), "state.json");
}

export async function specSessionDir(rootDir: string, sessionId: string): Promise<string> {
  return sessionExtensionDir(rootDir, "spec", sessionId);
}

export async function checkpointsDir(rootDir: string, sessionId: string): Promise<string> {
  return path.join(await specSessionDir(rootDir, sessionId), "checkpoints");
}

export function normalizeSpecStatus(value: unknown): SpecStatus {
  if (value === "draft" || value === "active" || value === "blocked" || value === "completed") {
    return value;
  }
  throw new Error(`Invalid spec status: ${String(value ?? "")}`);
}

export function normalizeSpecTaskStatus(value: unknown): SpecTaskStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }
  throw new Error(`Invalid spec task status: ${String(value ?? "")}`);
}

export function renderSpecDocument(input: {
  title: string;
  requirements: string;
  design: string;
  tasks: string;
}): string {
  return `${[
    `# ${input.title}`,
    "",
    "## Requirements",
    "",
    input.requirements.trimEnd(),
    "",
    "## Design",
    "",
    input.design.trimEnd(),
    "",
    "## Tasks",
    "",
    input.tasks.trimEnd(),
    "",
  ].join("\n")}`;
}

function normalizeSpecState(value: SpecState, sessionId: string): SpecState {
  return {
    schemaVersion: 1,
    id: typeof value.id === "string" && value.id ? value.id : sanitizeStateSegment(sessionId),
    title: typeof value.title === "string" && value.title ? value.title : "Untitled spec",
    status: normalizeSpecStatus(value.status),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    notes: Array.isArray(value.notes) ? value.notes.map(normalizeNote) : [],
    tasks: Array.isArray(value.tasks) ? value.tasks.map(normalizeTask) : [],
  };
}

function normalizeNote(value: SpecNoteRecord): SpecNoteRecord {
  return {
    at: typeof value.at === "string" ? value.at : new Date(0).toISOString(),
    text: typeof value.text === "string" ? value.text : "",
  };
}

function normalizeTask(value: SpecTaskRecord): SpecTaskRecord {
  return {
    id: String(value.id),
    text: String(value.text),
    status: normalizeSpecTaskStatus(value.status),
  };
}
