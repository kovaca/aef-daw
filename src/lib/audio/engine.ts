import type { MixState } from "../state.svelte.js";
import { PixelSourceDriver } from "./pixel-source.js";
import type { TurboState } from "./turbo-state.svelte.js";
import { VoicePool, type CableTuple } from "./voice-pool.js";

/** 
 * AudioEngine — the single Web Audio context + signal graph + voice pool.
 *
 * The graph (all modes share the FX rack so dials feel identical):
 *
 *   voices ─┐
 *           ├─→ channelMix ─→ drive (WaveShaper) ─→ delay (with feedback) ──┐
 *   pixel ──┘                                       │                       │
 *                                                   └────── reverb ─────────┤
 *                                                                           ↓
 *                                                      master gain → destination
 *
 */

function denseCables(aef: MixState): CableTuple[] {
  const out: CableTuple[] = [];
  for (const ch of ["r", "g", "b"] as const) {
    for (const [band, weight] of aef.mix[ch]) {
      if (weight === 0) continue;
      out.push({ channel: ch, band, weight });
    }
  }
  return out;
}

/** Build a short synthetic noise impulse response so we can ship reverb
 * without a fetched audio asset. */
function buildNoiseIR(ctx: AudioContext, durationSec = 1.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * durationSec);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay x white noise, slight per-channel decorrelation.
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
    }
  }
  return buf;
}

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  // tanh(k·x) where k grows with amount; amount in [0,1]. The return type is
  // pinned to Float32Array<ArrayBuffer> re WaveShaperNode.curve's setter.
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 1 + amount * 12;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x);
  }
  return curve;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channelMix: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private drive: WaveShaperNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private dryMix: GainNode | null = null;
  private wetReverb: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoDepth: GainNode | null = null;

  private voices: VoicePool | null = null;
  private pixelDriver: PixelSourceDriver | null = null;
  private pixelStarted = false;
  /** Map canvas reference held until the engine starts and the driver exists. */
  private pendingCanvas: HTMLCanvasElement | null = null;

  /** Returns true once the AudioContext exists; we lazily create it on
      `start()` so tab open doesn't unlock audio policy. */
  get ready(): boolean {
    return !!this.ctx;
  }

  /** Hand the engine a reference to the maplibre canvas. Pixel-source
      sampling reads from this. Safe to call before `start()`. */
  setMapCanvas(canvas: HTMLCanvasElement): void {
    this.pendingCanvas = canvas;
    if (this.pixelDriver) this.pixelDriver.setCanvas(canvas);
  }

  /** User-gesture entrypoint — lazily creates the AudioContext and graph,
      then resumes it. Safe to call multiple times. */
  async start(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") {
      await this.ctx.suspend();
    }
  }

  private buildGraph() {
    const ctx = this.ctx!;

    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    this.dryMix = ctx.createGain();
    this.dryMix.gain.value = 0.75;

    this.wetReverb = ctx.createGain();
    this.wetReverb.gain.value = 0.25;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = buildNoiseIR(ctx);

    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.25;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);

    this.drive = ctx.createWaveShaper();
    this.drive.curve = makeDriveCurve(0.15);
    this.drive.oversample = "2x";

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 4500;
    this.filter.Q.value = 0.7;

    this.channelMix = ctx.createGain();
    this.channelMix.gain.value = 1;

    // Wire: mix → filter → drive → delay → (dry + reverb) → master
    this.channelMix.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.delay);
    this.delay.connect(this.dryMix);
    this.delay.connect(this.convolver);
    this.convolver.connect(this.wetReverb);
    this.dryMix.connect(this.master);
    this.wetReverb.connect(this.master);

    // LFO modulates filter cutoff. Gain = depth in Hz.
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.4;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 600;
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.filter.frequency);
    this.lfo.start();

    this.voices = new VoicePool(ctx, this.channelMix);
    this.pixelDriver = new PixelSourceDriver(ctx);
    if (this.pendingCanvas) this.pixelDriver.setCanvas(this.pendingCanvas);
  }

  /** Reactive sync — called from a Svelte $effect in +page.svelte. Cheap to
      invoke repeatedly; only the bits that changed are pushed to the graph. */
  async sync(aef: MixState, turbo: TurboState): Promise<void> {
    if (!this.ctx || !this.master) return;

    const audible = turbo.enabled && turbo.playing;

    // Master volume — ramp to avoid clicks when toggling power.
    const target = audible ? turbo.master : 0;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + 0.05);

    // Filter cutoff — log curve from 80 Hz to 18 kHz.
    if (this.filter) {
      const lo = Math.log(80);
      const hi = Math.log(18000);
      const cutoffHz = Math.exp(lo + turbo.cutoff * (hi - lo));
      this.filter.frequency.linearRampToValueAtTime(cutoffHz, now + 0.03);
      this.filter.Q.linearRampToValueAtTime(
        0.3 + turbo.resonance * 12,
        now + 0.03,
      );
    }
    if (this.drive) {
      this.drive.curve = makeDriveCurve(turbo.drive);
    }
    if (this.delay) {
      this.delay.delayTime.linearRampToValueAtTime(
        turbo.delayTime,
        now + 0.05,
      );
    }
    if (this.delayFeedback) {
      this.delayFeedback.gain.linearRampToValueAtTime(
        Math.min(0.9, turbo.delayFeedback),
        now + 0.05,
      );
    }
    if (this.wetReverb && this.dryMix) {
      this.wetReverb.gain.linearRampToValueAtTime(turbo.reverbMix, now + 0.05);
      this.dryMix.gain.linearRampToValueAtTime(1 - turbo.reverbMix, now + 0.05);
    }
    if (this.lfo) {
      // year 0..8 → 0.05..8 Hz exponential
      const yr = aef.yearIdx / 8;
      const rate = 0.05 * Math.pow(8 / 0.05, yr);
      this.lfo.frequency.linearRampToValueAtTime(rate, now + 0.1);
    }

    // Voice pool / pixel driver — only run when turbo is enabled.
    const cables = denseCables(aef);
    const attackSec = 0.005 + turbo.attack * 2;
    const releaseSec = 0.02 + turbo.release * 3;

    if (turbo.enabled && turbo.sourceMode === "cables") {
      if (this.pixelStarted) {
        this.pixelDriver?.disconnect();
        this.pixelStarted = false;
      }
      this.voices?.sync(cables, attackSec, releaseSec);
    } else if (turbo.enabled && turbo.sourceMode === "pixels") {
      // Release the pentatonic voices; the pixel-driven wavetable replaces
      // them. Cables don't need to be forwarded to the worklet — they
      // already shape what colors are on the canvas via the GPU shader.
      this.voices?.releaseAll(releaseSec);
      if (!this.pixelStarted) {
        await this.pixelDriver?.init(this.channelMix!);
        this.pixelStarted = true;
      }
      // Wavetable pitch tracks the cutoff dial: low cutoff → low rumble,
      // high cutoff → bright tone. Maps log 30 Hz..2 kHz across the dial.
      const lo = Math.log(30);
      const hi = Math.log(2000);
      const cycleHz = Math.exp(lo + turbo.cutoff * (hi - lo));
      this.pixelDriver?.setRate(cycleHz);
    } else {
      this.voices?.releaseAll(releaseSec);
      if (this.pixelStarted) {
        this.pixelDriver?.disconnect();
        this.pixelStarted = false;
      }
    }
  }

  destroy() {
    try {
      this.lfo?.stop();
      this.voices?.releaseAll(0.05);
      this.pixelDriver?.destroy();
      this.master?.disconnect();
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.master = null;
  }
}

export const audioEngine = new AudioEngine();
