/** Fixed-capacity capture storage that overwrites the oldest sample in O(1). */
export class CircularBuffer<T> {
  private readonly storage: Array<T | undefined>;
  private start = 0;
  private length = 0;

  constructor(readonly capacity: number, initial: readonly T[] = []) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.storage = new Array<T | undefined>(capacity);
    initial.slice(-capacity).forEach((value) => this.push(value));
  }

  push(value: T): void {
    const index = (this.start + this.length) % this.capacity;
    this.storage[index] = value;
    if (this.length < this.capacity) this.length += 1;
    else this.start = (this.start + 1) % this.capacity;
  }

  pushMany(values: readonly T[]): void {
    values.forEach((value) => this.push(value));
  }

  replace(values: readonly T[]): void {
    this.storage.fill(undefined);
    this.start = 0;
    this.length = 0;
    this.pushMany(values.slice(-this.capacity));
  }

  toArray(): T[] {
    return Array.from({ length: this.length }, (_, index) => this.storage[(this.start + index) % this.capacity]!);
  }
}
