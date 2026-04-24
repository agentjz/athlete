interface PendingUpdateCommit {
  updateId: number;
  settled: boolean;
  error: unknown;
}

export class TelegramUpdateCommitQueue {
  private readonly pendingUpdateCommits: PendingUpdateCommit[] = [];
  private readonly pendingUpdateIds = new Set<number>();

  hasPending(updateId: number): boolean {
    return this.pendingUpdateIds.has(updateId);
  }

  markPending(updateId: number): void {
    this.pendingUpdateIds.add(updateId);
  }

  queueCommit(updateId: number, tasks: Promise<void>[]): void {
    const entry: PendingUpdateCommit = {
      updateId,
      settled: false,
      error: null,
    };

    Promise.all(tasks)
      .then(() => {
        entry.settled = true;
      })
      .catch((error) => {
        entry.error = error;
        entry.settled = true;
      });

    this.pendingUpdateCommits.push(entry);
  }

  async drain(commitUpdate: (updateId: number) => Promise<void>): Promise<void> {
    while (this.pendingUpdateCommits.length > 0) {
      const next = this.pendingUpdateCommits[0]!;
      if (!next.settled) {
        return;
      }

      if (next.error) {
        throw next.error;
      }

      await commitUpdate(next.updateId);
      this.pendingUpdateCommits.shift();
      this.pendingUpdateIds.delete(next.updateId);
    }
  }
}
