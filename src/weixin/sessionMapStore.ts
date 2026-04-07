import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface WeixinSessionBinding {
  peerKey: string;
  userId: string;
  sessionId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeixinSessionMapStoreLike {
  get(peerKey: string): Promise<WeixinSessionBinding | null>;
  set(binding: WeixinSessionBinding): Promise<void>;
  delete(peerKey: string): Promise<void>;
  list(): Promise<WeixinSessionBinding[]>;
}

export class FileWeixinSessionMapStore implements WeixinSessionMapStoreLike {
  private operationTail = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(peerKey: string): Promise<WeixinSessionBinding | null> {
    return this.withLock(async () => {
      const bindings = await this.readAll();
      return bindings.find((binding) => binding.peerKey === peerKey) ?? null;
    });
  }

  async set(binding: WeixinSessionBinding): Promise<void> {
    await this.withLock(async () => {
      const bindings = await this.readAll();
      const next = bindings.filter((entry) => entry.peerKey !== binding.peerKey);
      next.push(binding);
      next.sort((left, right) => left.peerKey.localeCompare(right.peerKey));
      await this.writeAll(next);
    });
  }

  async delete(peerKey: string): Promise<void> {
    await this.withLock(async () => {
      const bindings = await this.readAll();
      const next = bindings.filter((entry) => entry.peerKey !== peerKey);
      if (next.length === bindings.length) {
        return;
      }

      await this.writeAll(next);
    });
  }

  async list(): Promise<WeixinSessionBinding[]> {
    return this.withLock(async () => this.readAll());
  }

  private async readAll(): Promise<WeixinSessionBinding[]> {
    const payload = await readJsonFile<{ bindings?: WeixinSessionBinding[] } | null>(this.filePath, null);
    return Array.isArray(payload?.bindings) ? payload.bindings : [];
  }

  private async writeAll(bindings: WeixinSessionBinding[]): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      bindings,
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
