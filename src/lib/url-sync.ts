import { LOCATIONS } from "./aef/locations.js";
import type { Channel, MixState, Mode } from "./state.svelte.js";

/**
 * Encodes the patch state into a hash fragment so URLs are shareable.
 *
 * Format:
 *   m=basic|advanced|turbo
 *   y=<yearIdx>
 *   lng=<lng>&lat=<lat>&z=<zoom>
 *   r=<min>,<max>
 *   c=r:<band>:<w>,r:<band>:<w>,g:<band>:<w>,b:<band>:<w>
 *
 * Legacy `l=<presetId>` is still read on load (and resolved to lng/lat/z)
 * so old shared URLs continue to work; it is no longer written.
 */
export function serialize(state: MixState): string {
  const parts: string[] = [];
  parts.push(`m=${state.mode}`);
  parts.push(`y=${state.yearIdx}`);
  parts.push(`lng=${state.lng.toFixed(4)}`);
  parts.push(`lat=${state.lat.toFixed(4)}`);
  parts.push(`z=${state.zoom.toFixed(2)}`);
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
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

  // View: prefer explicit lng/lat/z; fall back to legacy preset id for
  // backward compat with URLs shared before this format change.
  const lngStr = params.get("lng");
  const latStr = params.get("lat");
  const zStr = params.get("z");
  if (lngStr !== null && latStr !== null && zStr !== null) {
    const lng = Number(lngStr);
    const lat = Number(latStr);
    const zoom = Number(zStr);
    if (Number.isFinite(lng)) state.lng = clamp(lng, -180, 180);
    if (Number.isFinite(lat)) state.lat = clamp(lat, -85, 85);
    if (Number.isFinite(zoom)) state.zoom = clamp(zoom, 0, 22);
  } else {
    const legacyId = params.get("l");
    if (legacyId) {
      const loc = LOCATIONS.find((l) => l.id === legacyId);
      if (loc) {
        state.lng = loc.longitude;
        state.lat = loc.latitude;
        state.zoom = loc.zoom;
      }
    }
  }

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
