export class AsyncQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T, priority = false): boolean {
    if (this.closed) return false;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else if (priority) this.values.unshift(value);
    else this.values.push(value);
    return true;
  }

  next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) return Promise.resolve({ value: this.values.shift()!, done: false });
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(discard = false): void {
    if (this.closed) return;
    this.closed = true;
    if (discard) this.values.length = 0;
    if (this.values.length > 0) return;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }
}
