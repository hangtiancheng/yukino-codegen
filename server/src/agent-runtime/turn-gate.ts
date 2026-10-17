/**
 * Process-wide concurrency gate for agent turns.
 *
 * Each AgentRuntime already serializes its own turns, but a multi-user
 * deployment can host many live runtimes at once. Without a global cap every
 * connected workspace could run an LLM loop (plus tool executions) in
 * parallel, overloading the shared model provider and the host. The gate
 * admits at most `limit` concurrent agent loops across all runtimes and
 * queues the rest.
 *
 * Fairness: waiters carry a key (the acting user). When a slot frees up the
 * gate prefers a waiter whose key differs from the last admitted one, so a
 * single user submitting a burst of turns cannot starve everyone else. The
 * queue stays FIFO within the fairness constraint.
 */
export class TurnGate {
  private readonly limit: number;
  private activeCount = 0;
  private readonly waiters: Array<{ key: string | undefined; admit: () => void }> = [];
  private lastAdmittedKey: string | undefined;

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  /** Number of turns currently admitted. */
  get active(): number {
    return this.activeCount;
  }

  /** Number of turns waiting for a slot. */
  get pending(): number {
    return this.waiters.length;
  }

  /**
   * Acquires a turn slot. Resolves immediately when under the limit,
   * otherwise waits with per-key fairness. When `signal` aborts while queued
   * the waiter is removed and the promise rejects, so a canceled or disposing
   * runtime never blocks graceful shutdown on a free slot. The returned
   * release function is idempotent.
   */
  acquire(signal?: AbortSignal, fairnessKey?: string): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Turn aborted while waiting for a slot"));
    }
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      this.lastAdmittedKey = fairnessKey;
      return Promise.resolve(this.createRelease());
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: { key: string | undefined; admit: () => void } = {
        admit: () => {
          signal?.removeEventListener("abort", onAbort);
          this.activeCount += 1;
          this.lastAdmittedKey = waiter.key;
          resolve(this.createRelease());
        },
        key: fairnessKey,
      };
      const onAbort = (): void => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new Error("Turn aborted while waiting for a slot"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  /** Picks the next waiter: first FIFO entry whose key differs from the last
   *  admitted one when such an entry exists, otherwise the FIFO head. */
  private takeNextWaiter(): (() => void) | undefined {
    if (this.waiters.length === 0) return undefined;
    const fairIndex = this.waiters.findIndex((waiter) => waiter.key !== this.lastAdmittedKey);
    const chosen = this.waiters.splice(fairIndex === -1 ? 0 : fairIndex, 1)[0];
    return chosen?.admit;
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount -= 1;
      this.takeNextWaiter()?.();
    };
  }
}
