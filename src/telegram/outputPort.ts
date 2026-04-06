import type { ShellOutputPort } from "../interaction/shell.js";
import { chunkTelegramMessage } from "./messageChunking.js";

export class TelegramOutputPort implements ShellOutputPort {
  private readonly pending: Promise<unknown>[] = [];

  constructor(
    private readonly options: {
      chatId: number;
      messageChunkChars: number;
      enqueueReply: (chatId: number, text: string) => Promise<void>;
    },
  ) {}

  plain(text: string): void {
    this.queue(text);
  }

  info(text: string): void {
    this.queue(text);
  }

  warn(text: string): void {
    this.queue(`Warning: ${text}`);
  }

  error(text: string): void {
    this.queue(`Error: ${text}`);
  }

  dim(text: string): void {
    this.queue(text);
  }

  heading(text: string): void {
    this.queue(text);
  }

  tool(text: string): void {
    this.queue(`Tool: ${text}`);
  }

  interrupt(text: string): void {
    this.queue(`Interrupt: ${text}`);
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) {
      return;
    }

    const tasks = this.pending.splice(0, this.pending.length);
    await Promise.all(tasks);
  }

  private queue(text: string): void {
    for (const chunk of chunkTelegramMessage(text, this.options.messageChunkChars)) {
      this.pending.push(this.options.enqueueReply(this.options.chatId, chunk));
    }
  }
}
