import type { WeixinClientLike } from "./client.js";
import type { WeixinRuntimeConfig } from "./config.js";
import type { WeixinSyncBufStoreLike } from "./syncBufStore.js";
import type { WeixinPollingBatch, WeixinPollingSourceLike } from "./types.js";

export class WeixinPollingSource implements WeixinPollingSourceLike {
  private loaded = false;
  private syncBuf: string | null = null;
  private timeoutMs: number;

  constructor(
    private readonly client: WeixinClientLike,
    private readonly syncBufStore: WeixinSyncBufStoreLike,
    private readonly config: WeixinRuntimeConfig,
  ) {
    this.timeoutMs = config.polling.timeoutMs;
  }

  async poll(signal?: AbortSignal): Promise<WeixinPollingBatch> {
    if (signal?.aborted) {
      return {
        messages: [],
        syncBuf: this.syncBuf,
      };
    }

    await this.ensureLoaded();
    const batch = await this.client.getUpdates(this.syncBuf, this.timeoutMs, signal);
    if (
      typeof batch.longPollingTimeoutMs === "number" &&
      Number.isFinite(batch.longPollingTimeoutMs) &&
      batch.longPollingTimeoutMs > 0
    ) {
      this.timeoutMs = Math.trunc(batch.longPollingTimeoutMs);
    }
    return batch;
  }

  async commit(syncBuf: string | null): Promise<void> {
    await this.ensureLoaded();
    if (!syncBuf) {
      return;
    }

    this.syncBuf = syncBuf;
    await this.syncBufStore.save(syncBuf);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.syncBuf = await this.syncBufStore.load();
    this.loaded = true;
  }
}
