/**
 * Map a band index (0..63) and channel/sign to a frequency in Hz.
 *
 * Pentatonic minor stretched across ~5 octaves from A2 (≈110 Hz). Pentatonic
 * keeps any patch musically consonant regardless of which bands are wired up,
 * which matters because the 64 AEF embedding axes have no inherent semantics.
 *
 * Negative weights transpose down a perfect fifth and start the oscillator
 * 180° out of phase, so the sign of a weight has a perceptual signature.
 * 
 * And if we play it backwards, might sound like the devil's music which is rad.
 */
const PENTATONIC_MINOR = [0, 3, 5, 7, 10] as const;

const ROOT_HZ = 110; // A2

export function bandToFreq(band: number, sign: 1 | -1 = 1): number {
  const idx = ((band % 64) + 64) % 64;
  const octave = Math.floor(idx / PENTATONIC_MINOR.length);
  const degree = PENTATONIC_MINOR[idx % PENTATONIC_MINOR.length]!;
  let semis = degree + 12 * octave;
  if (sign < 0) semis -= 7; // perfect fifth down for negative weights
  return ROOT_HZ * Math.pow(2, semis / 12);
}

/** Channel-driven stereo pan. */
export function channelPan(ch: "r" | "g" | "b"): number {
  return ch === "r" ? -0.7 : ch === "b" ? 0.7 : 0;
}

/** Channel-driven detune in cents. */
export function channelDetuneCents(ch: "r" | "g" | "b"): number {
  return ch === "r" ? -7 : ch === "b" ? 7 : 0;
}
