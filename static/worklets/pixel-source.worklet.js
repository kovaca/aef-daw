// @ts-nocheck
// Pixel-source AudioWorklet — wavetable sonification of the rendered map.
//
// The main thread samples a horizontal strip of the maplibre canvas at the
// viewport center and posts three Float32Array wavetables (R, G, B) of length
// N to this worklet. Each per-channel cursor advances at audio rate through
// its wavetable; output is summed and stereo-spread (L favors R+G, R favors
// B+G).
//
// As long as the strip keeps changing (because the user pans, edits weights,
// scrubs the year, etc.) the wavetables refresh and the timbre evolves. With
// nothing changing the canvas, the wavetables are static and the worklet
// emits a steady tone. That mirrors the visual: a still picture sounds like
// a held chord.

class PixelSourceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Three Float32 wavetables, length = wtLen. Range -1..1. */
    this.wtR = new Float32Array(0);
    this.wtG = new Float32Array(0);
    this.wtB = new Float32Array(0);
    this.wtLen = 0;
    /** Phases [0..1) per channel. */
    this.phR = 0;
    this.phG = 0.013;
    this.phB = 0.027;
    /** Base cycle frequency in Hz. */
    this.cycleHz = 110;
    /** Output gain (the FX rack does additional limiting downstream). */
    this.gain = 0.6;

    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "wavetables") {
        this.wtR = d.r;
        this.wtG = d.g;
        this.wtB = d.b;
        this.wtLen = (d.r && d.r.length) | 0;
      } else if (d.type === "rate") {
        this.cycleHz = Math.max(20, +d.cycleHz);
      } else if (d.type === "gain") {
        this.gain = +d.gain;
      }
    };
  }

  static get parameterDescriptors() {
    return [];
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const left = out[0];
    const right = out[1] ?? out[0];
    const N = left.length;

    if (this.wtLen < 2) {
      for (let i = 0; i < N; i++) {
        left[i] = 0;
        if (right !== left) right[i] = 0;
      }
      return true;
    }

    const wtR = this.wtR;
    const wtG = this.wtG;
    const wtB = this.wtB;
    const wtLen = this.wtLen;
    const sr = sampleRate;
    // Cycles per audio frame, expressed as fractional wavetable advance.
    const inc = this.cycleHz / sr;
    const gain = this.gain;

    for (let i = 0; i < N; i++) {
      // Linear interpolation between adjacent wavetable samples.
      const fR = this.phR * wtLen;
      const iR = fR | 0;
      const tR = fR - iR;
      const r =
        wtR[iR] * (1 - tR) + wtR[(iR + 1) % wtLen] * tR;

      const fG = this.phG * wtLen;
      const iG = fG | 0;
      const tG = fG - iG;
      const g =
        wtG[iG] * (1 - tG) + wtG[(iG + 1) % wtLen] * tG;

      const fB = this.phB * wtLen;
      const iB = fB | 0;
      const tB = fB - iB;
      const b =
        wtB[iB] * (1 - tB) + wtB[(iB + 1) % wtLen] * tB;

      const l = r + 0.5 * g;
      const ri = b + 0.5 * g;
      // Soft tanh limiter; FX rack does the rest.
      left[i] = Math.tanh(gain * l);
      if (right !== left) right[i] = Math.tanh(gain * ri);

      // Slight per-channel detune via different phase rates so even a flat
      // stripe of color produces a chorus-like beating instead of a static
      // mono tone.
      this.phR += inc;
      if (this.phR >= 1) this.phR -= 1;
      this.phG += inc * 1.005;
      if (this.phG >= 1) this.phG -= 1;
      this.phB += inc * 0.995;
      if (this.phB >= 1) this.phB -= 1;
    }
    return true;
  }
}

registerProcessor("pixel-source", PixelSourceProcessor);
