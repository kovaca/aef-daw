import type { AsyncReadable } from "zarrita";

/**
 * Data-path counters for benchmarking, exposed as `window.__aefPerf` (and the
 * app state as `window.__aef`) in `vite dev` and `npm run build:perf` builds.
 * Everything here is a no-op in a normal production build.
 */
export type PerfCounters = {
  /** Network-level getRange/get calls that reached the FetchStore. */
  requests: number;
  /** Bytes returned by those calls. */
  bytes: number;
  /** Viewport-load timings (ms since the last layer rebuild or moveend). */
  loads: number[];
};

export const perf: PerfCounters = { requests: 0, bytes: 0, loads: [] };

/** True in `vite dev` and in builds made with `vite build --mode perf`. */
export const PERF = import.meta.env.DEV || import.meta.env.MODE === "perf";

/** `performance.mark` when PERF is on; read back via getEntriesByType("mark"). */
export function mark(name: string): void {
  if (PERF) performance.mark(name);
}

if (PERF && typeof window !== "undefined") {
  (window as unknown as { __aefPerf: PerfCounters }).__aefPerf = perf;
}

/** Wrap the innermost (network) store so every fetch is counted. */
export function countRequests<S extends AsyncReadable>(store: S): S {
  if (!PERF) return store;
  const tally = (bytes: Uint8Array | undefined) => {
    perf.requests += 1;
    perf.bytes += bytes?.byteLength ?? 0;
    return bytes;
  };
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "get" && prop !== "getRange") return value;
      return (...args: unknown[]) =>
        (value as (...a: unknown[]) => Promise<Uint8Array | undefined>)
          .apply(target, args)
          .then(tally);
    },
  });
}
