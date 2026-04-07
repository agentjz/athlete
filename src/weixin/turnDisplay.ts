import {
  DurableTurnDisplay,
  type DurableTurnDisplayScheduler,
} from "../chat/durableTurnDisplay.js";

export type WeixinTurnDisplayScheduler = DurableTurnDisplayScheduler;

export class WeixinTurnDisplay extends DurableTurnDisplay<{ userId: string }> {
  constructor(
    options: {
      userId: string;
      sendTyping: (userId: string) => Promise<void>;
      enqueueVisibleMessage: (target: { userId: string }, text: string) => Promise<void>;
      typingIntervalMs: number;
      scheduleTypingTick?: (
        callback: () => Promise<void> | void,
        intervalMs: number,
      ) => WeixinTurnDisplayScheduler;
    },
  ) {
    super({
      target: {
        userId: options.userId,
      },
      sendTyping: async (target) => options.sendTyping(target.userId),
      enqueueVisibleMessage: options.enqueueVisibleMessage,
      shouldEmitEvent: (event) => event.kind !== "tool_call",
      typingIntervalMs: options.typingIntervalMs,
      scheduleTypingTick: options.scheduleTypingTick,
    });
  }
}
