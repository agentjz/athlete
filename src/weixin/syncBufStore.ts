import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface WeixinSyncBufStoreLike {
  load(): Promise<string | null>;
  save(syncBuf: string): Promise<void>;
  clear(): Promise<void>;
}

export class FileWeixinSyncBufStore implements WeixinSyncBufStoreLike {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string | null> {
    const payload = await readJsonFile<{ syncBuf?: string } | null>(this.filePath, null);
    if (!payload || typeof payload.syncBuf !== "string" || !payload.syncBuf.trim()) {
      return null;
    }

    return payload.syncBuf;
  }

  async save(syncBuf: string): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      syncBuf,
    });
  }

  async clear(): Promise<void> {
    await writeJsonFileAtomically(this.filePath, null);
  }
}
