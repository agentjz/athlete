import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export type WeixinAttachmentMediaKind = "image" | "video" | "file" | "voice";

export interface WeixinAttachmentRecord {
  id: string;
  peerKey: string;
  userId: string;
  messageId: number;
  seq: number;
  sessionId: string;
  mediaKind: WeixinAttachmentMediaKind;
  localFilePath: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  text?: string;
  contextToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeixinAttachmentStoreLike {
  add(record: WeixinAttachmentRecord): Promise<void>;
  getLatestByPeer(peerKey: string): Promise<WeixinAttachmentRecord | null>;
  listByPeer(peerKey: string, limit?: number): Promise<WeixinAttachmentRecord[]>;
}

export class FileWeixinAttachmentStore implements WeixinAttachmentStoreLike {
  private operationTail = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async add(record: WeixinAttachmentRecord): Promise<void> {
    await this.withLock(async () => {
      const records = await this.readAll();
      const next = records.filter((entry) => entry.id !== record.id);
      next.push(record);
      next.sort((left, right) => {
        if (left.updatedAt === right.updatedAt) {
          return left.id.localeCompare(right.id);
        }

        return left.updatedAt.localeCompare(right.updatedAt);
      });
      await this.writeAll(trimRecords(next, 200));
    });
  }

  async getLatestByPeer(peerKey: string): Promise<WeixinAttachmentRecord | null> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const matches = records.filter((entry) => entry.peerKey === peerKey);
      return matches[matches.length - 1] ?? null;
    });
  }

  async listByPeer(peerKey: string, limit = 5): Promise<WeixinAttachmentRecord[]> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const matches = records.filter((entry) => entry.peerKey === peerKey);
      return matches.slice(Math.max(0, matches.length - Math.max(1, limit))).reverse();
    });
  }

  private async readAll(): Promise<WeixinAttachmentRecord[]> {
    const payload = await readJsonFile<{ attachments?: WeixinAttachmentRecord[] } | null>(this.filePath, null);
    return Array.isArray(payload?.attachments) ? payload.attachments : [];
  }

  private async writeAll(records: WeixinAttachmentRecord[]): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      attachments: records,
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function trimRecords(records: WeixinAttachmentRecord[], maxRecords: number): WeixinAttachmentRecord[] {
  if (records.length <= maxRecords) {
    return records;
  }

  return records.slice(records.length - maxRecords);
}
