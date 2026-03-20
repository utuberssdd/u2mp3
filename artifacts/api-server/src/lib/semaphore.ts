/**
 * Semaphore — limits the number of concurrent async operations.
 * Excess callers are queued and served in FIFO order.
 */
export class Semaphore {
  private available: number;
  private queue: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(private readonly maxConcurrent: number) {
    this.available = maxConcurrent;
  }

  get queueLength() {
    return this.queue.length;
  }

  get activeTasks() {
    return this.maxConcurrent - this.available;
  }

  /**
   * Acquire a slot. Resolves with a `release` function.
   * Rejects with "Queue full" if the queue is deeper than `maxQueue`.
   */
  acquire(maxQueue = 50, timeoutMs = 30_000): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= maxQueue) {
        reject(new Error("Server is busy — too many requests queued. Please try again shortly."));
        return;
      }

      const release = () => {
        this.available++;
        this._flush();
      };

      if (this.available > 0) {
        this.available--;
        resolve(release);
        return;
      }

      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((e) => e.timer === timer);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error("Request timed out while waiting for a free slot."));
      }, timeoutMs);

      this.queue.push({ resolve: () => resolve(release), timer });
    });
  }

  private _flush() {
    if (this.available > 0 && this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timer);
      this.available--;
      next.resolve();
    }
  }
}

/** Shared semaphores — tune limits here */
export const infoSemaphore = new Semaphore(20);   // up to 20 concurrent info lookups
export const downloadSemaphore = new Semaphore(10); // up to 10 concurrent downloads (CPU-heavy)
