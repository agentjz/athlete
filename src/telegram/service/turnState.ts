import type { TelegramActiveTurn } from "../turnRunner.js";

export class TelegramTurnState {
  private readonly activeTurns = new Map<string, TelegramActiveTurn>();
  private readonly pendingStopRequests = new Set<string>();
  private readonly queuedTurnCounts = new Map<string, number>();

  getActiveTurn(peerKey: string): TelegramActiveTurn | undefined {
    return this.activeTurns.get(peerKey);
  }

  setActiveTurn(peerKey: string, activeTurn: TelegramActiveTurn): void {
    this.activeTurns.set(peerKey, activeTurn);
  }

  clearActiveTurn(peerKey: string): void {
    this.activeTurns.delete(peerKey);
  }

  consumePendingStop(peerKey: string): boolean {
    return this.pendingStopRequests.delete(peerKey);
  }

  armPendingStop(peerKey: string): void {
    this.pendingStopRequests.add(peerKey);
  }

  incrementQueuedTurns(peerKey: string): void {
    this.queuedTurnCounts.set(peerKey, this.getQueuedTurnCount(peerKey) + 1);
  }

  decrementQueuedTurns(peerKey: string): void {
    const nextCount = Math.max(0, this.getQueuedTurnCount(peerKey) - 1);
    if (nextCount === 0) {
      this.queuedTurnCounts.delete(peerKey);
      return;
    }

    this.queuedTurnCounts.set(peerKey, nextCount);
  }

  getQueuedTurnCount(peerKey: string): number {
    return this.queuedTurnCounts.get(peerKey) ?? 0;
  }

  abortAllActiveTurns(message: string): void {
    for (const activeTurn of this.activeTurns.values()) {
      if (!activeTurn.controller.signal.aborted) {
        activeTurn.controller.abort(message);
      }
    }
  }
}
