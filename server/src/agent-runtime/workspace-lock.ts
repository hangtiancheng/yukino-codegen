/**
 * A minimal promise-chaining mutex. Each `run` call is enqueued behind the
 * previous one for the same lock instance, guaranteeing that agent turns for a
 * given workspace execute strictly one at a time (and that file mutations use
 * the same serialization as turns).
 */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    // Keep the chain alive even if a task rejects; swallow only for the tail.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Waits for every task queued before this call, without blocking later tasks. */
  drain(): Promise<void> {
    return this.tail;
  }
}

/** Named registry of locks, one per key (e.g. per workspace id). */
export class WorkspaceLockRegistry {
  private readonly locks = new Map<string, AsyncLock>();

  get(key: string): AsyncLock {
    const existing = this.locks.get(key);
    if (existing !== undefined) return existing;
    const created = new AsyncLock();
    this.locks.set(key, created);
    return created;
  }

  delete(key: string): void {
    this.locks.delete(key);
  }
}
