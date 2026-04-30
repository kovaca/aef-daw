import { bandToFreq, channelDetuneCents, channelPan } from "./scale.js";

/** You might be thinking "oh voice pools that's just where sirens gather" 
 * and you'd be mostly right, but in this case we're using it to manage the
 * audio synthesis  */


export type Channel = "r" | "g" | "b";

/** Identity for a cable voice — one pair (channel, band) maps to one Voice. */
function voiceKey(ch: Channel, band: number): string {
  return `${ch}:${band}`;
}

export type CableTuple = {
  channel: Channel;
  band: number;
  weight: number;
};

class Voice {
  readonly osc: OscillatorNode;
  readonly amp: GainNode;
  readonly pan: StereoPannerNode;
  channel: Channel;
  band: number;
  /** Sign of the most recently applied weight; remembered for sign-flip xfade. */
  sign: 1 | -1 = 1;

  constructor(
    ctx: AudioContext,
    channel: Channel,
    band: number,
    initialWeight: number,
    destination: AudioNode,
    attackSec: number,
  ) {
    this.channel = channel;
    this.band = band;
    this.sign = initialWeight < 0 ? -1 : 1;

    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = bandToFreq(band, this.sign);
    this.osc.detune.value = channelDetuneCents(channel);

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = channelPan(channel);

    this.osc.connect(this.amp);
    this.amp.connect(this.pan);
    this.pan.connect(destination);

    this.osc.start();
    const now = ctx.currentTime;
    this.amp.gain.setValueAtTime(0, now);
    this.amp.gain.linearRampToValueAtTime(
      Math.abs(initialWeight),
      now + Math.max(0.005, attackSec),
    );
  }

  setWeight(ctx: AudioContext, weight: number, attackSec: number) {
    const newSign: 1 | -1 = weight < 0 ? -1 : 1;
    const now = ctx.currentTime;
    if (newSign !== this.sign) {
      // Sign flip → quick frequency bump (perfect fifth) over a 30 ms ramp.
      this.osc.frequency.setTargetAtTime(
        bandToFreq(this.band, newSign),
        now,
        0.01,
      );
      this.sign = newSign;
    }
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(this.amp.gain.value, now);
    this.amp.gain.linearRampToValueAtTime(
      Math.abs(weight),
      now + Math.max(0.005, attackSec),
    );
  }

  release(ctx: AudioContext, releaseSec: number) {
    const now = ctx.currentTime;
    const r = Math.max(0.005, releaseSec);
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(this.amp.gain.value, now);
    this.amp.gain.linearRampToValueAtTime(0, now + r);
    this.osc.stop(now + r + 0.01);
    setTimeout(
      () => {
        try {
          this.osc.disconnect();
          this.amp.disconnect();
          this.pan.disconnect();
        } catch {
          /* noop */
        }
      },
      Math.max(50, (r + 0.05) * 1000),
    );
  }
}

/**
 * Diff-based voice pool. `sync()` reconciles the current set of cable tuples
 * against live voices: adds new voices with attack ramps, releases removed
 * ones with release tails, updates weights in-place with a 20 ms gain ramp.
 */
export class VoicePool {
  private ctx: AudioContext;
  private destination: AudioNode;
  private voices = new Map<string, Voice>();

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  setDestination(node: AudioNode) {
    this.destination = node;
  }

  sync(cables: CableTuple[], attackSec: number, releaseSec: number) {
    const seen = new Set<string>();
    for (const c of cables) {
      const key = voiceKey(c.channel, c.band);
      seen.add(key);
      const existing = this.voices.get(key);
      if (existing) {
        // 20 ms ramp on edits — short enough to feel instant during knob
        // drags, long enough to suppress zipper noise from rapid pointermove.
        existing.setWeight(this.ctx, c.weight, 0.02);
      } else {
        const v = new Voice(
          this.ctx,
          c.channel,
          c.band,
          c.weight,
          this.destination,
          attackSec,
        );
        this.voices.set(key, v);
      }
    }
    for (const [key, voice] of this.voices) {
      if (!seen.has(key)) {
        voice.release(this.ctx, releaseSec);
        this.voices.delete(key);
      }
    }
  }

  releaseAll(releaseSec: number) {
    for (const [, voice] of this.voices) {
      voice.release(this.ctx, releaseSec);
    }
    this.voices.clear();
  }
}
