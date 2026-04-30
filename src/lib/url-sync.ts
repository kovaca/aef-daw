import type { Channel, MixState, Mode } from "./state.svelte.js";

/**
 * Encodes the patch state into a hash fragment so URLs are shareable.
 *
 * Format:
 *   m=basic|advanced
 *   y=<yearIdx>
 *   l=<locationId>
 *   r=<min>,<max>
 *   c=r:<band>:<w>,r:<band>:<w>,g:<band>:<w>,b:<band>:<w>
 */
export function serialize(state: MixState): string {
  const parts: string[] = [];
  parts.push(`m=${state.mode}`);
  parts.push(`y=${state.yearIdx}`);
  parts.push(`l=${state.locationId}`);
  parts.push(`r=${state.rescale[0].toFixed(3)},${state.rescale[1].toFixed(3)}`);
  const cables: string[] = [];
  for (const ch of ["r", "g", "b"] as const) {
    for (const [band, w] of state.mix[ch]) {
      cables.push(`${ch}:${band}:${w.toFixed(3)}`);
    }
  }
  parts.push(`c=${cables.join(",")}`);
  return parts.join("&");
}

export function applyHash(state: MixState, hash: string): void {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return;
  const params = new URLSearchParams(trimmed);
  const m = params.get("m");
  if (m === "basic" || m === "advanced" || m === "turbo") state.mode = m as Mode;
  const y = params.get("y");
  if (y !== null) {
    const yi = Number(y);
    if (Number.isFinite(yi)) state.yearIdx = Math.min(8, Math.max(0, yi));
  }
  const l = params.get("l");
  if (l) state.locationId = l;
  const r = params.get("r");
  if (r) {
    const [lo, hi] = r.split(",").map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== undefined && hi !== undefined) {
      state.rescale = [lo, hi];
    }
  }
  const c = params.get("c");
  if (c !== null) {
    const next: Record<Channel, Map<number, number>> = {
      r: new Map(),
      g: new Map(),
      b: new Map(),
    };
    for (const entry of c.split(",")) {
      if (!entry) continue;
      const [ch, bandStr, wStr] = entry.split(":");
      if (ch !== "r" && ch !== "g" && ch !== "b") continue;
      const band = Number(bandStr);
      const w = Number(wStr);
      if (!Number.isFinite(band) || !Number.isFinite(w)) continue;
      next[ch].set(band, w);
    }
    state.mix = next;
  }
}
