import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface TelegramAttachmentRecord {
  id: string;
  peerKey: string;
  userId: number;
  chatId: number;
  messageId: number;
  updateId: number;
  sessionId: string;
  telegramFileId: string;
  telegramFileUniqueId: string;
  telegramFilePath: string;
  localFilePath: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  caption?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramAttachmentStoreLike {
  add(record: TelegramAttachmentRecord): Promise<void>;
  getLatestByPeer(peerKey: string): Promise<TelegramAttachmentRecord | null>;
  listByPeer(peerKey: string, limit?: number): Promise<TelegramAttachmentRecord[]>;
}

export class FileTelegramAttachmentStore implements TelegramAttachmentStoreLike {
  private operationTail = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async add(record: TelegramAttachmentRecord): Promise<void> {
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

  async getLatestByPeer(peerKey: string): Promise<TelegramAttachmentRecord | null> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const matches = records.filter((entry) => entry.peerKey === peerKey);
      return matches[matches.length - 1] ?? null;
    });
  }

  async listByPeer(peerKey: string, limit = 5): Promise<TelegramAttachmentRecord[]> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const matches = records.filter((entry) => entry.peerKey === peerKey);
      return matches.slice(Math.max(0, matches.length - Math.max(1, limit))).reverse();
    });
  }

  private async readAll(): Promise<TelegramAttachmentRecord[]> {
    const payload = await readJsonFile<{ attachments?: TelegramAttachmentRecord[] } | null>(this.filePath, null);
    return Array.isArray(payload?.attachments) ? payload.attachments : [];
  }

  private async writeAll(records: TelegramAttachmentRecord[]): Promise<void> {
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

function trimRecords(records: TelegramAttachmentRecord[], maxRecords: number): TelegramAttachmentRecord[] {
  if (records.length <= maxRecords) {
    return records;
  }

  return records.slice(records.length - maxRecords);
}
