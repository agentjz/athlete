import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ChangeOperationRecord, ChangeRecord } from "../types.js";

export interface RecordChangeOperation {
  path: string;
  kind: "create" | "update" | "delete";
  beforeData?: Buffer;
  afterData?: Buffer;
  binary: boolean;
  preview?: string;
}

export interface RecordChangeInput {
  sessionId?: string;
  cwd: string;
  toolName: string;
  summary: string;
  preview?: string;
  operations: RecordChangeOperation[];
}

export interface UndoChangeResult {
  record: ChangeRecord;
  restoredPaths: string[];
}

export class ChangeStore {
  constructor(private readonly changesDir: string) {}

  async record(input: RecordChangeInput): Promise<ChangeRecord> {
    const id = createChangeId();
    const timestamp = new Date().toISOString();
    const blobDir = path.join(this.changesDir, id);

    await fs.mkdir(blobDir, { recursive: true });

    const operations = await Promise.all(
      input.operations.map(async (operation, index) => {
        const beforeSnapshotPath = await this.writeSnapshot(
          blobDir,
          `${index}.before`,
          operation.beforeData,
        );
        const afterSnapshotPath = await this.writeSnapshot(
          blobDir,
          `${index}.after`,
          operation.afterData,
        );

        const record: ChangeOperationRecord = {
          path: operation.path,
          kind: operation.kind,
          binary: operation.binary,
          preview: operation.preview,
        };

        if (beforeSnapshotPath) {
          record.beforeSnapshotPath = beforeSnapshotPath;
          record.beforeBytes = operation.beforeData?.byteLength;
        }

        if (afterSnapshotPath) {
          record.afterSnapshotPath = afterSnapshotPath;
          record.afterBytes = operation.afterData?.byteLength;
        }

        return record;
      }),
    );

    const record: ChangeRecord = {
      id,
      createdAt: timestamp,
      sessionId: input.sessionId,
      cwd: input.cwd,
      toolName: input.toolName,
      summary: input.summary,
      preview: input.preview,
      operations,
    };

    await fs.mkdir(this.changesDir, { recursive: true });
    await fs.writeFile(this.getMetadataPath(id), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  async list(limit = 20): Promise<ChangeRecord[]> {
    await fs.mkdir(this.changesDir, { recursive: true });
    const entries = await fs.readdir(this.changesDir, { withFileTypes: true });

    const changes = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => this.load(path.basename(entry.name, ".json"))),
    );

    return changes
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async load(id: string): Promise<ChangeRecord> {
    const raw = await fs.readFile(this.getMetadataPath(id), "utf8");
    return JSON.parse(raw) as ChangeRecord;
  }

  async loadLatestUndoable(): Promise<ChangeRecord | null> {
    const changes = await this.list(200);
    return changes.find((record) => !record.undoneAt) ?? null;
  }

  async undo(changeId?: string): Promise<UndoChangeResult> {
    const record = changeId ? await this.load(changeId) : await this.loadLatestUndoable();
    if (!record) {
      throw new Error("No recorded change is available to undo.");
    }

    if (record.undoneAt) {
      throw new Error(`Change ${record.id} was already undone at ${record.undoneAt}.`);
    }

    const restoredPaths: string[] = [];

    for (let index = record.operations.length - 1; index >= 0; index -= 1) {
      const operation = record.operations[index];
      if (!operation) {
        continue;
      }

      restoredPaths.push(operation.path);

      if (operation.beforeSnapshotPath) {
        const buffer = await this.readSnapshot(operation.beforeSnapshotPath);
        await fs.mkdir(path.dirname(operation.path), { recursive: true });
        await fs.writeFile(operation.path, buffer);
        continue;
      }

      await fs.rm(operation.path, { force: true });
    }

    const updated: ChangeRecord = {
      ...record,
      undoneAt: new Date().toISOString(),
    };
    await fs.writeFile(this.getMetadataPath(updated.id), `${JSON.stringify(updated, null, 2)}\n`, "utf8");

    return {
      record: updated,
      restoredPaths: restoredPaths.reverse(),
    };
  }

  private getMetadataPath(id: string): string {
    return path.join(this.changesDir, `${id}.json`);
  }

  private async writeSnapshot(
    blobDir: string,
    label: string,
    buffer: Buffer | undefined,
  ): Promise<string | undefined> {
    if (!buffer) {
      return undefined;
    }

    const fileName = `${label}.bin`;
    const absolutePath = path.join(blobDir, fileName);
    await fs.writeFile(absolutePath, buffer);
    return path.relative(this.changesDir, absolutePath);
  }

  private async readSnapshot(relativePath: string): Promise<Buffer> {
    return fs.readFile(path.join(this.changesDir, relativePath));
  }
}

function createChangeId(): string {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${date}-${random}`;
}
