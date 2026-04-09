import {
  DurableTurnDisplay,
  type DurableTurnDisplayScheduler,
} from "../chat/durableTurnDisplay.js";

export type TelegramTurnDisplayScheduler = DurableTurnDisplayScheduler;

export class TelegramTurnDisplay extends DurableTurnDisplay<{ chatId: number }> {
  constructor(
    options: {
      chatId: number;
      sendTyping: (chatId: number) => Promise<void>;
      enqueueVisibleMessage: (target: { chatId: number }, text: string) => Promise<void>;
      typingIntervalMs: number;
      scheduleTypingTick?: (
        callback: () => Promise<void> | void,
        intervalMs: number,
      ) => TelegramTurnDisplayScheduler;
    },
  ) {
    super({
      target: {
        chatId: options.chatId,
      },
      sendTyping: async (target) => options.sendTyping(target.chatId),
      enqueueVisibleMessage: options.enqueueVisibleMessage,
      shouldEmitEvent: (event) => event.kind !== "tool_call",
      flushBufferedAssistantBeforeToolEvents: true,
      enableAssistantStageEvents: true,
      typingIntervalMs: options.typingIntervalMs,
      scheduleTypingTick: options.scheduleTypingTick,
    });
  }
}
