import type { TelegramRuntimeConfig } from "./config.js";
import type { TelegramBotApiClient } from "./botApiClient.js";
import type { TelegramUpdate } from "./types.js";
import type { TelegramOffsetStoreLike } from "./offsetStore.js";

export class TelegramLongPollingSource {
  constructor(
    private readonly bot: TelegramBotApiClient,
    private readonly offsetStore: TelegramOffsetStoreLike,
    private readonly config: TelegramRuntimeConfig,
  ) {}

  async getUpdates(signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const offset = await this.offsetStore.load();
    return this.bot.getUpdates({
      offset: offset ?? undefined,
      limit: this.config.polling.limit,
      timeoutSeconds: this.config.polling.timeoutSeconds,
      signal,
    });
  }

  async commit(updateId: number): Promise<void> {
    await this.offsetStore.save(updateId + 1);
  }
}
