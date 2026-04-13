import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export type WeixinContextTokenStatus = "active" | "invalid";

export interface WeixinContextTokenRecord {
  peerKey: string;
  userId: string;
  contextToken: string;
  status: WeixinContextTokenStatus;
  updatedAt: string;
  invalidReason?: string;
}

export interface WeixinContextTokenStoreLike {
  get(peerKey: string): Promise<WeixinContextTokenRecord | null>;
  set(record: WeixinContextTokenRecord): Promise<void>;
  markInvalid(peerKey: string, reason: string): Promise<void>;
  getUsableToken(peerKey: string): Promise<string | null>;
  list(): Promise<WeixinContextTokenRecord[]>;
}

export class FileWeixinContextTokenStore implements WeixinContextTokenStoreLike {
  private operationTail = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(peerKey: string): Promise<WeixinContextTokenRecord | null> {
    return this.withLock(async () => {
      const records = await this.readAll();
      return records.find((record) => record.peerKey === peerKey) ?? null;
    });
  }

  async set(record: WeixinContextTokenRecord): Promise<void> {
    await this.withLock(async () => {
      const records = await this.readAll();
      const next = records.filter((entry) => entry.peerKey !== record.peerKey);
      next.push({
        ...record,
        contextToken: record.contextToken.trim(),
        userId: record.userId.trim(),
      });
      next.sort((left, right) => left.peerKey.localeCompare(right.peerKey));
      await this.writeAll(next);
    });
  }

  async markInvalid(peerKey: string, reason: string): Promise<void> {
    await this.withLock(async () => {
      const records = await this.readAll();
      const existing = records.find((record) => record.peerKey === peerKey);
      if (!existing) {
        return;
      }

      const next = records
        .filter((record) => record.peerKey !== peerKey)
        .concat({
          ...existing,
          status: "invalid",
          invalidReason: reason,
          updatedAt: new Date().toISOString(),
        });
      next.sort((left, right) => left.peerKey.localeCompare(right.peerKey));
      await this.writeAll(next);
    });
  }

  async getUsableToken(peerKey: string): Promise<string | null> {
    const record = await this.get(peerKey);
    if (!record || record.status !== "active" || !record.contextToken.trim()) {
      return null;
    }

    return record.contextToken;
  }

  async list(): Promise<WeixinContextTokenRecord[]> {
    return this.withLock(async () => this.readAll());
  }

  private async readAll(): Promise<WeixinContextTokenRecord[]> {
    const payload = await readJsonFile<{ records?: WeixinContextTokenRecord[] } | null>(this.filePath, null);
    return Array.isArray(payload?.records) ? payload.records : [];
  }

  private async writeAll(records: WeixinContextTokenRecord[]): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      records,
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
