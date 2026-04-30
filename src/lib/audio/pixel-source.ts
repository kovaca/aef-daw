import { base } from "$app/paths";

// The worklet ships as a verbatim static asset so that AudioWorkletGlobalScope
// gets a real script URL (data: URLs are inconsistently supported across
// browsers). `base` is /aef-daw on GH Pages and "" in dev.
const workletUrl = `${base}/worklets/pixel-source.worklet.js`;

const WAVETABLE_LEN = 128; // samples per cycle, per channel
const SAMPLE_HZ = 30; // canvas resample rate

/**
 * Driver for the pixel-source AudioWorklet. Continuously samples a horizontal
 * strip of the maplibre canvas and pushes three RGB wavetables to the worklet.
 * The strip is the row of pixels at the viewport's vertical center, downsampled
 * to `WAVETABLE_LEN` columns spread across the full canvas width — so the
 * wavetable visually corresponds to the colors the user is looking at.
 *
 * Because the strip is the *rendered* image (not the raw embedding), every
 * control that changes the visualization — cable weights, year, rescale,
 * pan/zoom — automatically modulates the audio. The user adjusts a knob,
 * the colors change, the timbre changes.
 */
export class PixelSourceDriver {
  private ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private moduleLoaded = false;
  private canvas: HTMLCanvasElement | null = null;
  private samplerCanvas: HTMLCanvasElement;
  private samplerCtx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private active = false;
  private lastSampleAt = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    // Off-DOM 2D canvas used to downsample the map's WebGL canvas to a
    // WAVETABLE_LEN × 1 strip via drawImage(). drawImage from a webgl canvas
    // works as long as the WebGL context was created with
    // `preserveDrawingBuffer: true`.
    this.samplerCanvas = document.createElement("canvas");
    this.samplerCanvas.width = WAVETABLE_LEN;
    this.samplerCanvas.height = 1;
    const ctx2d = this.samplerCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!ctx2d) throw new Error("2D context unavailable");
    this.samplerCtx = ctx2d;
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(destination: AudioNode): Promise<void> {
    if (!this.moduleLoaded) {
      await this.ctx.audioWorklet.addModule(workletUrl);
      this.moduleLoaded = true;
    }
    if (!this.node) {
      this.node = new AudioWorkletNode(this.ctx, "pixel-source", {
        outputChannelCount: [2],
        numberOfInputs: 0,
        numberOfOutputs: 1,
      });
    }
    this.node.connect(destination);
    this.start();
  }

  setRate(cycleHz: number) {
    if (!this.node) return;
    this.node.port.postMessage({ type: "rate", cycleHz });
  }

  setGain(gain: number) {
    if (!this.node) return;
    this.node.port.postMessage({ type: "gain", gain });
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.lastSampleAt = 0;
    const tick = () => {
      if (!this.active) return;
      const now = performance.now();
      const minGap = 1000 / SAMPLE_HZ;
      if (now - this.lastSampleAt >= minGap) {
        this.lastSampleAt = now;
        this.sampleAndPost();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.active = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  disconnect() {
    this.stop();
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* noop */
      }
    }
  }

  destroy() {
    this.disconnect();
    this.node = null;
  }

  private sampleAndPost() {
    if (!this.node || !this.canvas) return;
    const cv = this.canvas;
    if (!cv.width || !cv.height) return;
    try {
      // Take a 1-pixel-tall horizontal strip at the canvas's vertical center,
      // scaled to WAVETABLE_LEN columns. The 2D canvas does the bilinear
      // downsampling for us in one drawImage call.
      this.samplerCtx.clearRect(0, 0, WAVETABLE_LEN, 1);
      const yMid = (cv.height / 2) | 0;
      this.samplerCtx.drawImage(
        cv,
        0,
        yMid,
        cv.width,
        1,
        0,
        0,
        WAVETABLE_LEN,
        1,
      );
      const img = this.samplerCtx.getImageData(0, 0, WAVETABLE_LEN, 1);
      const px = img.data; // RGBA, length = WAVETABLE_LEN * 4
      const r = new Float32Array(WAVETABLE_LEN);
      const g = new Float32Array(WAVETABLE_LEN);
      const b = new Float32Array(WAVETABLE_LEN);
      // 0..255 → -1..1 (DC-centered). Squaring sign-preserve emphasizes
      // bright color contrast over flat midtones.
      for (let i = 0; i < WAVETABLE_LEN; i++) {
        const off = i * 4;
        const rv = (px[off] - 128) / 128;
        const gv = (px[off + 1] - 128) / 128;
        const bv = (px[off + 2] - 128) / 128;
        r[i] = rv;
        g[i] = gv;
        b[i] = bv;
      }
      this.node.port.postMessage(
        { type: "wavetables", r, g, b },
        [r.buffer, g.buffer, b.buffer],
      );
    } catch (err) {
      console.warn("[aef-daw] canvas sample failed", err);
    }
  }
}
