/** Small LRU for expensive, immutable view calculations. */
export class BoundedCache<T> {
  private readonly entries = new Map<string, T>()
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.limit) {
      this.entries.delete(this.entries.keys().next().value!)
    }
  }
}
