import type { ByteCache, CacheKeyFor } from "zarrita";

/**
 * `ByteCache` for `zarr.withByteCaching`, evicting least-recently-used
 * entries once the total stored byteLength exceeds `maxBytes`.
 */
export class ByteLru implements ByteCache {
  #map = new Map<string, Uint8Array | undefined>();
  #bytes = 0;

  constructor(readonly maxBytes: number) {}

  has(key: string): boolean {
    return this.#map.has(key);
  }

  get(key: string): Uint8Array | undefined {
    const value = this.#map.get(key);
    // Re-insert so Map iteration order tracks recency.
    if (this.#map.delete(key)) this.#map.set(key, value);
    return value;
  }

  set(key: string, value: Uint8Array | undefined): void {
    this.#bytes -= this.#map.get(key)?.byteLength ?? 0;
    this.#map.delete(key);
    this.#map.set(key, value);
    this.#bytes += value?.byteLength ?? 0;
    for (const [k, v] of this.#map) {
      if (this.#bytes <= this.maxBytes) break;
      this.#map.delete(k);
      this.#bytes -= v?.byteLength ?? 0;
    }
  }
}

/**
 * Cache only explicit byte ranges, i.e. inner chunks read out of a shard.
 * Metadata is read once at startup and zarrita already memoizes shard
 * indices (suffix-range reads) per array.
 */
export const chunkRangesOnly: CacheKeyFor = (path, range) =>
  range && "offset" in range
    ? `${path}:${range.offset}:${range.length}`
    : undefined;
