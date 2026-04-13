import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface TelegramOffsetStoreLike {
  load(): Promise<number | null>;
  save(offset: number): Promise<void>;
}

export class FileTelegramOffsetStore implements TelegramOffsetStoreLike {
  constructor(private readonly filePath: string) {}

  async load(): Promise<number | null> {
    const payload = await readJsonFile<{ nextOffset?: number } | null>(this.filePath, null);
    if (!payload || !Number.isFinite(payload.nextOffset)) {
      return null;
    }

    return Math.trunc(payload.nextOffset as number);
  }

  async save(offset: number): Promise<void> {
    await writeJsonFileAtomically(this.filePath, {
      nextOffset: Math.trunc(offset),
    });
  }
}
