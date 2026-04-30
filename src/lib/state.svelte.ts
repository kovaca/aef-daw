import * as zarr from "zarrita";
import { fetchBandLabels } from "./aef/band-labels.js";
import { NUM_BANDS, VARIABLE, ZARR_URL } from "./aef/constants.js";
import { LOCATIONS, type Location } from "./aef/locations.js";

export type Channel = "r" | "g" | "b";
export type Mode = "basic" | "advanced" | "turbo";
export type RescaleRange = [number, number];

const DEFAULT_R = 0;
const DEFAULT_G = 16;
const DEFAULT_B = 32;

function densify(sparse: Map<number, number>): Float32Array {
  const out = new Float32Array(NUM_BANDS);
  for (const [i, w] of sparse) {
    if (i >= 0 && i < NUM_BANDS) out[i] = w;
  }
  return out;
}

/**
 * Reactive state shared across the map, switchboard and control panel.
 * All cross-component coordination flows through one instance.
 */
export class MixState {
  mode = $state<Mode>("basic");
  mix = $state<Record<Channel, Map<number, number>>>({
    r: new Map([[DEFAULT_R, 1]]),
    g: new Map([[DEFAULT_G, 1]]),
    b: new Map([[DEFAULT_B, 1]]),
  });
  yearIdx = $state(8); // 2025
  rescale = $state<RescaleRange>([-0.3, 0.3]);
  locationId = $state<string>(LOCATIONS[0]!.id);

  arr = $state<zarr.Array<"int8", zarr.Readable> | null>(null);
  rootAttrs = $state<unknown>(null);
  bandLabels = $state<readonly string[] | null>(null);
  loadError = $state<string | null>(null);

  rWeightsDense = $derived(densify(this.mix.r));
  gWeightsDense = $derived(densify(this.mix.g));
  bWeightsDense = $derived(densify(this.mix.b));

  selection = $derived({ time: this.yearIdx, band: null as null });

  get location(): Location {
    return LOCATIONS.find((l) => l.id === this.locationId) ?? LOCATIONS[0]!;
  }

  /** Single sparse band index per channel (basic mode invariant). */
  basicBand(ch: Channel): number {
    const first = this.mix[ch].keys().next();
    return first.done ? 0 : first.value;
  }

  async load(): Promise<void> {
    try {
      const store = new zarr.FetchStore(ZARR_URL);
      const root = await zarr.open.v3(store, { kind: "group" });
      const opened = await zarr.open.v3(root.resolve(VARIABLE), {
        kind: "array",
      });
      if (!opened.is("int8")) {
        throw new Error(
          `Expected AEF embeddings to be int8, got ${opened.dtype}`,
        );
      }
      const labels = await fetchBandLabels(root);
      this.arr = opened;
      this.rootAttrs = root.attrs;
      this.bandLabels = labels;
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err);
      console.error("[aef-daw] load failed", err);
    }
  }

  setCable(ch: Channel, band: number, w: number): void {
    const next = new Map(this.mix[ch]);
    next.set(band, w);
    this.mix = { ...this.mix, [ch]: next };
  }

  removeCable(ch: Channel, band: number): void {
    const next = new Map(this.mix[ch]);
    next.delete(band);
    this.mix = { ...this.mix, [ch]: next };
  }

  /** Replace all cables on a channel with a single (band, weight) entry. */
  replaceCable(ch: Channel, band: number, w: number): void {
    this.mix = { ...this.mix, [ch]: new Map([[band, w]]) };
  }

  /**
   * Patch operation that respects mode invariants:
   * - basic: replace existing cable on this channel
   * - advanced: add or update without touching others
   */
  patchTo(ch: Channel, band: number, w: number = 1): void {
    if (this.mode === "basic") {
      this.replaceCable(ch, band, w);
    } else {
      this.setCable(ch, band, w);
    }
  }

  setMode(m: Mode): void {
    if (this.mode === m) return;
    if (m === "basic") {
      // Demote: keep highest |weight| cable per channel; force weight to 1.
      // turbo → basic and advanced → basic both go through this path.
      for (const ch of ["r", "g", "b"] as const) {
        const entries = [...this.mix[ch].entries()];
        if (entries.length === 0) {
          const fallback =
            ch === "r" ? DEFAULT_R : ch === "g" ? DEFAULT_G : DEFAULT_B;
          this.replaceCable(ch, fallback, 1);
          continue;
        }
        const [bestBand] = entries.reduce((a, b) =>
          Math.abs(a[1]) >= Math.abs(b[1]) ? a : b,
        );
        this.replaceCable(ch, bestBand, 1);
      }
    }
    // basic ↔ advanced ↔ turbo with no demotion in either advanced direction:
    // advanced and turbo share the same patch invariants (sparse weighted mix).
    this.mode = m;
  }

  /** True for advanced or turbo — both render with the weighted-mix shader. */
  get isAdvancedish(): boolean {
    return this.mode === "advanced" || this.mode === "turbo";
  }
}
