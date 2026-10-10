export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  drain(): Promise<void> {
    return this.tail;
  }
}

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
