export class PerPeerCommandQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async enqueue<T>(peerKey: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(peerKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(peerKey, tail);

    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(peerKey) === tail) {
        this.tails.delete(peerKey);
      }
    }
  }
}
