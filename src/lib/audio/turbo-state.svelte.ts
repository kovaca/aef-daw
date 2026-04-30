export type SourceMode = "cables" | "pixels";

/**
 * Turbo-mode audio params. Held separately from `MixState` so basic-mode
 * users pay zero reactivity cost and the visualization hot path stays clean.
 *
 * All values are normalized 0..1 except where noted; engine maps them to
 * audio-rate ranges. URL hash serializes only when `enabled` is true.
 */
export class TurboState {
  /** Turbo pane visible. Independent of `playing` so dials can be edited
      while the AudioContext is suspended. */
  enabled = $state(false);
  /** AudioContext running + audio audible. Driven by the POWER button. */
  playing = $state(false);
  sourceMode = $state<SourceMode>("cables");

  master = $state(0.4); // start low to be nice to unsuspecting ears.
  cutoff = $state(0.65); // log-curved → 80 Hz..18 kHz
  resonance = $state(0.2);
  attack = $state(0.05); // 5 ms..2 s
  release = $state(0.4);
  drive = $state(0.15);
  delayTime = $state(0.25); // 0..1 s
  delayFeedback = $state(0.3);
  reverbMix = $state(0.25);
}
