import fs from "node:fs/promises";
import path from "node:path";

import { decodeTextBuffer } from "../utils/text.js";
import {
  compactSpecTimestamp,
  normalizeSpecMarkdown,
  summarizeSpec,
} from "./format.js";
import {
  getSpecPaths,
  getSpecRootDir,
  getSpecSessionBindingFile,
  sanitizeSpecIdPart,
} from "./layout.js";
import {
  assertSpecDocumentName,
  assertSpecStage,
  assertSpecStatus,
  assertSpecTaskStatus,
  normalizeSpecCheckpoint,
  normalizeSpecState,
  SPEC_DOCUMENT_NAMES,
} from "./schema.js";
import {
  assertSpecWorkspaceCheckpointRestorable,
  createSpecWorkspaceCheckpoint,
  ensureSpecWorkspace,
  restoreSpecWorkspaceCheckpoint,
} from "./workspace.js";
import type {
  SpecCheckpointRecord,
  SpecDocumentName,
  SpecSessionBinding,
  SpecStage,
  SpecState,
  SpecStatus,
  SpecSummary,
  SpecTaskStatus,
} from "./types.js";

export { summarizeSpec } from "./format.js";

export class SpecStore {
  constructor(
    private readonly stateRootDir: string,
    private readonly options: {
      rootDir?: string;
    } = {},
  ) {}

  async create(input: {
    title: string;
    summary?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SpecState> {
    const now = new Date().toISOString();
    const id = await this.createUniqueSpecId(input.title, now);
    const paths = getSpecPaths(this.stateRootDir, id);
    await fs.mkdir(paths.checkpointsDir, { recursive: true });
    await fs.mkdir(paths.artifactsDir, { recursive: true });

    const workspace = await ensureSpecWorkspace({
      rootDir: this.requireRootDir("create a spec workspace"),
      stateRootDir: this.stateRootDir,
      specId: id,
    });

    const state: SpecState = {
      schemaVersion: 1,
      id,
      title: input.title.trim() || id,
      summary: input.summary?.trim() || undefined,
      stage: "requirements",
      status: "active",
      createdAt: now,
      updatedAt: now,
      sessionIds: input.sessionId ? [input.sessionId] : [],
      confirmed: {
        requirements: false,
        design: false,
        tasks: false,
      },
      tasks: {},
      workspace,
      metadata: input.metadata ?? {},
    };

    await this.saveState(state);
    await this.ensureDocuments(id);
    if (input.sessionId) {
      await this.bindSession(input.sessionId, id);
    }
    await this.createCheckpoint(id, {
      label: "spec created",
      reason: "Initial durable spec state.",
    });
    return this.load(id);
  }

  async load(id: string): Promise<SpecState> {
    const paths = getSpecPaths(this.stateRootDir, id);
    const raw = await fs.readFile(paths.stateFile, "utf8");
    return normalizeSpecState(JSON.parse(raw) as unknown);
  }

  async list(limit = 20): Promise<SpecSummary[]> {
    const changesDir = path.join(getSpecRootDir(this.stateRootDir), "changes");
    let entries: string[];
    try {
      entries = await fs.readdir(changesDir);
    } catch {
      return [];
    }

    const states = await Promise.all(entries.map(async (entry) => {
      try {
        return await this.load(entry);
      } catch {
        return null;
      }
    }));

    return states
      .filter((state): state is SpecState => Boolean(state))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map(summarizeSpec);
  }

  async search(query: string, limit = 20): Promise<SpecSummary[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    const specs = await this.list(100);
    if (terms.length === 0) {
      return specs.slice(0, limit);
    }

    const scored = await Promise.all(specs.map(async (summary) => {
      const docs = await this.readAllDocuments(summary.id).catch(() => ({} as Record<string, string>));
      const haystack = [
        summary.id,
        summary.title,
        summary.summary ?? "",
        Object.values(docs).join("\n"),
      ].join("\n").toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { summary, score };
    }));

    return scored
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.summary.updatedAt.localeCompare(left.summary.updatedAt))
      .slice(0, Math.max(1, Math.min(50, Math.trunc(limit))))
      .map((entry) => entry.summary);
  }

  async updateState(id: string, patch: {
    title?: string;
    summary?: string;
    stage?: SpecStage;
    status?: SpecStatus;
    confirmed?: Partial<SpecState["confirmed"]>;
    metadata?: Record<string, unknown>;
    sessionId?: string;
  }): Promise<SpecState> {
    const current = await this.load(id);
    const now = new Date().toISOString();
    const next: SpecState = {
      ...current,
      title: patch.title?.trim() || current.title,
      summary: patch.summary !== undefined ? patch.summary.trim() || undefined : current.summary,
      stage: patch.stage ?? current.stage,
      status: patch.status ?? current.status,
      updatedAt: now,
      confirmed: {
        ...current.confirmed,
        ...(patch.confirmed ?? {}),
      },
      metadata: {
        ...current.metadata,
        ...(patch.metadata ?? {}),
      },
      sessionIds: patch.sessionId && !current.sessionIds.includes(patch.sessionId)
        ? [...current.sessionIds, patch.sessionId]
        : current.sessionIds,
    };
    await this.saveState(next);
    return next;
  }

  async bindSession(sessionId: string, specId: string): Promise<SpecSessionBinding> {
    const binding: SpecSessionBinding = {
      schemaVersion: 1,
      sessionId,
      specId,
      updatedAt: new Date().toISOString(),
    };
    const file = getSpecSessionBindingFile(this.stateRootDir, sessionId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
    await this.addSessionToSpec(specId, sessionId).catch(() => undefined);
    return binding;
  }

  async loadSessionBinding(sessionId: string): Promise<SpecSessionBinding | null> {
    try {
      const raw = await fs.readFile(getSpecSessionBindingFile(this.stateRootDir, sessionId), "utf8");
      const parsed = JSON.parse(raw) as SpecSessionBinding;
      if (parsed.schemaVersion !== 1 || parsed.sessionId !== sessionId || typeof parsed.specId !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async writeDocument(id: string, document: SpecDocumentName, content: string): Promise<{
    state: SpecState;
    path: string;
  }> {
    assertSpecDocumentName(document);
    const paths = getSpecPaths(this.stateRootDir, id);
    await fs.mkdir(paths.specDir, { recursive: true });
    await fs.writeFile(paths.documents[document], normalizeSpecMarkdown(content), "utf8");
    const state = await this.updateState(id, {});
    return { state, path: paths.documents[document] };
  }

  async appendNote(id: string, input: {
    heading?: string;
    content: string;
  }): Promise<{
    state: SpecState;
    path: string;
  }> {
    const paths = getSpecPaths(this.stateRootDir, id);
    await fs.mkdir(paths.specDir, { recursive: true });
    const current = await this.readDocument(id, "notes").catch(() => "");
    const timestamp = new Date().toISOString();
    const heading = input.heading?.trim() || "Spec note";
    const content = normalizeSpecMarkdown(input.content);
    const entry = [
      `## ${heading}`,
      "",
      `Recorded: ${timestamp}`,
      "",
      content,
      "",
    ].join("\n");
    const nextContent = current.trim()
      ? `${current.trimEnd()}\n\n${entry}`
      : `# Notes\n\n${entry}`;
    await fs.writeFile(paths.documents.notes, normalizeSpecMarkdown(nextContent), "utf8");
    const state = await this.updateState(id, {});
    return { state, path: paths.documents.notes };
  }

  async readDocument(id: string, document: SpecDocumentName): Promise<string> {
    assertSpecDocumentName(document);
    const file = getSpecPaths(this.stateRootDir, id).documents[document];
    const buffer = await fs.readFile(file);
    const decoded = decodeTextBuffer(buffer);
    if (!decoded) {
      throw new Error(`Spec document is not readable UTF-8 text: ${file}`);
    }
    return decoded.text;
  }

  async readAllDocuments(id: string): Promise<Record<SpecDocumentName, string>> {
    const result = {} as Record<SpecDocumentName, string>;
    for (const document of SPEC_DOCUMENT_NAMES) {
      result[document] = await this.readDocument(id, document).catch(() => "");
    }
    return result;
  }

  async updateTask(id: string, taskId: string, patch: {
    title?: string;
    status: SpecTaskStatus;
    evidence?: string;
  }): Promise<SpecState> {
    assertSpecTaskStatus(patch.status);
    const current = await this.load(id);
    const now = new Date().toISOString();
    const next: SpecState = {
      ...current,
      updatedAt: now,
      tasks: {
        ...current.tasks,
        [taskId]: {
          id: taskId,
          title: patch.title ?? current.tasks[taskId]?.title,
          status: patch.status,
          evidence: patch.evidence ?? current.tasks[taskId]?.evidence,
          updatedAt: now,
        },
      },
    };
    await this.saveState(next);
    return next;
  }

  async createCheckpoint(id: string, input: {
    label: string;
    reason?: string;
  }): Promise<SpecCheckpointRecord> {
    const state = await this.load(id);
    const createdAt = new Date().toISOString();
    const checkpoint: SpecCheckpointRecord = {
      id: `${compactSpecTimestamp(createdAt)}-${sanitizeSpecIdPart(input.label).slice(0, 32)}`,
      label: input.label.trim() || "checkpoint",
      reason: input.reason?.trim() || undefined,
      createdAt,
      stage: state.stage,
      status: state.status,
    };
    if (state.workspace) {
      checkpoint.workspace = await createSpecWorkspaceCheckpoint({
        workspace: state.workspace,
        specId: id,
        checkpointId: checkpoint.id,
        label: checkpoint.label,
      });
    }
    const paths = getSpecPaths(this.stateRootDir, id);
    const dir = path.join(paths.checkpointsDir, checkpoint.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "checkpoint.json"), `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    for (const document of SPEC_DOCUMENT_NAMES) {
      const content = await this.readDocument(id, document).catch(() => "");
      await fs.writeFile(path.join(dir, `${document}.md`), content, "utf8");
    }
    await this.saveState({
      ...state,
      currentCheckpointId: checkpoint.id,
      updatedAt: createdAt,
    });
    return checkpoint;
  }

  async listCheckpoints(id: string): Promise<SpecCheckpointRecord[]> {
    const dir = getSpecPaths(this.stateRootDir, id).checkpointsDir;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const checkpoints = await Promise.all(entries.map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(dir, entry, "checkpoint.json"), "utf8");
        return normalizeSpecCheckpoint(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    }));
    return checkpoints
      .filter((item): item is SpecCheckpointRecord => Boolean(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restoreCheckpoint(id: string, checkpointId: string): Promise<SpecState> {
    const paths = getSpecPaths(this.stateRootDir, id);
    const dir = path.join(paths.checkpointsDir, checkpointId);
    const raw = await fs.readFile(path.join(dir, "state.json"), "utf8");
    const checkpoint = await fs.readFile(path.join(dir, "checkpoint.json"), "utf8")
      .then((value) => normalizeSpecCheckpoint(JSON.parse(value) as unknown));
    const restored = normalizeSpecState(JSON.parse(raw) as unknown);
    if (restored.workspace && checkpoint.workspace) {
      await assertSpecWorkspaceCheckpointRestorable({
        rootDir: this.requireRootDir("restore a spec workspace checkpoint"),
        stateRootDir: this.stateRootDir,
        workspace: restored.workspace,
      });
    }
    const now = new Date().toISOString();
    const next: SpecState = {
      ...restored,
      updatedAt: now,
      currentCheckpointId: checkpoint.id,
      metadata: {
        ...restored.metadata,
        restoredFromCheckpoint: checkpoint.id,
        restoredAt: now,
      },
    };
    await this.saveState(next);
    for (const document of SPEC_DOCUMENT_NAMES) {
      const source = path.join(dir, `${document}.md`);
      const content = await fs.readFile(source, "utf8").catch(() => "");
      await fs.writeFile(paths.documents[document], content, "utf8");
    }
    if (next.workspace && checkpoint.workspace) {
      await restoreSpecWorkspaceCheckpoint({
        rootDir: this.requireRootDir("restore a spec workspace checkpoint"),
        stateRootDir: this.stateRootDir,
        workspace: next.workspace,
        checkpoint: checkpoint.workspace,
      });
    }
    return next;
  }

  private async ensureDocuments(id: string): Promise<void> {
    const paths = getSpecPaths(this.stateRootDir, id);
    for (const document of SPEC_DOCUMENT_NAMES) {
      await fs.writeFile(paths.documents[document], createInitialSpecDocument(document), {
        encoding: "utf8",
        flag: "wx",
      }).catch(async (error: unknown) => {
        if (isFileExistsError(error)) {
          return;
        }
        throw error;
      });
    }
  }

  private async saveState(state: SpecState): Promise<void> {
    assertSpecStage(state.stage);
    assertSpecStatus(state.status);
    const paths = getSpecPaths(this.stateRootDir, state.id);
    await fs.mkdir(paths.specDir, { recursive: true });
    await fs.writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private async addSessionToSpec(specId: string, sessionId: string): Promise<void> {
    const current = await this.load(specId);
    if (current.sessionIds.includes(sessionId)) {
      return;
    }
    await this.saveState({
      ...current,
      sessionIds: [...current.sessionIds, sessionId],
      updatedAt: new Date().toISOString(),
    });
  }

  private async createUniqueSpecId(title: string, createdAt: string): Promise<string> {
    const base = `${compactSpecTimestamp(createdAt)}-${sanitizeSpecIdPart(title)}`;
    let id = base;
    for (let index = 2; ; index += 1) {
      try {
        await fs.access(getSpecPaths(this.stateRootDir, id).stateFile);
        id = `${base}-${index}`;
      } catch {
        return id;
      }
    }
  }

  private requireRootDir(action: string): string {
    if (!this.options.rootDir) {
      throw new Error(`SpecStore requires rootDir to ${action}.`);
    }
    return this.options.rootDir;
  }
}

function createInitialSpecDocument(document: SpecDocumentName): string {
  switch (document) {
    case "requirements":
      return normalizeSpecMarkdown([
        "# Requirements",
        "",
        "## Accepted Facts",
        "",
        "## Scope",
        "",
        "## Success Criteria",
        "",
        "## Non-goals",
        "",
        "## Open Questions",
        "",
      ].join("\n"));
    case "design":
      return normalizeSpecMarkdown([
        "# Design",
        "",
        "## Current Facts",
        "",
        "## Architecture",
        "",
        "## Data and State",
        "",
        "## Risks",
        "",
      ].join("\n"));
    case "tasks":
      return normalizeSpecMarkdown([
        "# Tasks",
        "",
        "- [ ] Confirm requirements.",
        "- [ ] Confirm design.",
        "- [ ] Confirm implementation tasks.",
        "- [ ] Implement from confirmed tasks.",
        "- [ ] Validate against success criteria.",
        "",
      ].join("\n"));
    case "notes":
      return normalizeSpecMarkdown([
        "# Notes",
        "",
        "This document records factual interview notes, accepted decisions, review evidence, and unresolved questions.",
        "",
      ].join("\n"));
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
