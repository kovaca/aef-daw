<script lang="ts">
  import type { TurboState } from "$lib/audio/turbo-state.svelte.js";
  import { audioEngine } from "$lib/audio/engine.js";
  import Dial from "./Dial.svelte";

  let { turbo }: { turbo: TurboState } = $props();

  async function togglePower() {
    if (!turbo.playing) {
      try {
        await audioEngine.start();
        turbo.playing = true;
      } catch (err) {
        console.warn("[aef-daw] audio start failed", err);
      }
    } else {
      turbo.playing = false;
      void audioEngine.suspend();
    }
  }
</script>

<section class="turbo">
  <header class="row">
    <button
      class="power"
      class:on={turbo.playing}
      onclick={togglePower}
      aria-pressed={turbo.playing}
      aria-label="Audio power"
    >
      <span class="led" aria-hidden="true"></span>
      <span class="silkscreen pwr-label">{turbo.playing ? "ON" : "OFF"}</span>
    </button>

    <div class="source-toggle">
      <span class="silkscreen silkscreen-dim">SRC</span>
      <button
        class="src"
        class:active={turbo.sourceMode === "cables"}
        onclick={() => (turbo.sourceMode = "cables")}
      >CABLES</button>
      <button
        class="src exp"
        class:active={turbo.sourceMode === "pixels"}
        onclick={() => (turbo.sourceMode = "pixels")}
        title="Experimental: drive audio from the embedding values under the map's center"
      >PIXELS<span class="exp-tag">exp</span></button>
    </div>

    <div class="master">
      <Dial
        value={turbo.master}
        min={0}
        max={1}
        size={42}
        color="var(--silkscreen)"
        label="MASTER"
        onChange={(v) => (turbo.master = v)}
      />
    </div>
  </header>

  <div class="sections">
    <div class="section filter">
      <span class="silkscreen sec-label">FILTER</span>
      <div class="dials">
        <Dial
          value={turbo.cutoff}
          min={0}
          max={1}
          size={38}
          color="var(--led-g)"
          label="CUTOFF"
          onChange={(v) => (turbo.cutoff = v)}
        />
        <Dial
          value={turbo.resonance}
          min={0}
          max={1}
          size={38}
          color="var(--led-g)"
          label="RES"
          onChange={(v) => (turbo.resonance = v)}
        />
        <Dial
          value={turbo.drive}
          min={0}
          max={1}
          size={38}
          color="var(--led-g)"
          label="DRIVE"
          onChange={(v) => (turbo.drive = v)}
        />
      </div>
    </div>

    <div class="section envelope">
      <span class="silkscreen sec-label">ENVELOPE</span>
      <div class="dials">
        <Dial
          value={turbo.attack}
          min={0}
          max={1}
          size={38}
          color="var(--led-amber)"
          label="ATTACK"
          onChange={(v) => (turbo.attack = v)}
        />
        <Dial
          value={turbo.release}
          min={0}
          max={1}
          size={38}
          color="var(--led-amber)"
          label="RELEASE"
          onChange={(v) => (turbo.release = v)}
        />
      </div>
    </div>

    <div class="section space">
      <span class="silkscreen sec-label">SPACE</span>
      <div class="dials">
        <Dial
          value={turbo.delayTime}
          min={0}
          max={1}
          size={38}
          color="var(--led-b)"
          label="DELAY"
          onChange={(v) => (turbo.delayTime = v)}
        />
        <Dial
          value={turbo.delayFeedback}
          min={0}
          max={0.9}
          size={38}
          color="var(--led-b)"
          label="FBK"
          onChange={(v) => (turbo.delayFeedback = v)}
        />
        <Dial
          value={turbo.reverbMix}
          min={0}
          max={1}
          size={38}
          color="var(--led-b)"
          label="VERB"
          onChange={(v) => (turbo.reverbMix = v)}
        />
      </div>
    </div>

    <p class="shortcuts silkscreen silkscreen-dim">
      space=power · s=src · [/]=vol · m=mute · 1/2/3=mode
    </p>
  </div>
</section>

<style>
  .turbo {
    flex: 0 0 320px;
    width: 320px;
    box-sizing: border-box;
    padding: 10px 12px;
    background: var(--panel-body);
    border-left: 1px solid var(--panel-edge);
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    /* Scroll the dial bank inside the panel rather than letting it push
       the drawer height. Custom scrollbar matches the dark anodized look. */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--screw) var(--panel-body);
    box-shadow: inset 1px 0 0 var(--rim-highlight);
  }
  .turbo::-webkit-scrollbar {
    width: 6px;
  }
  .turbo::-webkit-scrollbar-track {
    background: var(--panel-edge);
  }
  .turbo::-webkit-scrollbar-thumb {
    background: var(--screw);
    border-radius: 3px;
  }


  @media (max-width: 720px) {
    .turbo {
      flex: 0 0 auto;
      width: 100%;
      height: auto;
      gap: 10px;
      padding: 14px 16px 18px;
      overflow-y: visible;
      border-left: 0;
      border-top: 1px solid var(--panel-edge);
      box-shadow: inset 0 1px 0 var(--rim-highlight);
    }
    .shortcuts {
      margin-top: 4px;
    }
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }
  .power {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    color: var(--silkscreen-dim);
  }
  .power .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--panel-edge);
    box-shadow: inset 0 0 1px rgba(0, 0, 0, 0.6);
  }
  .power.on .led {
    background: var(--led-r);
    box-shadow: 0 0 6px var(--led-r), inset 0 0 1px rgba(0, 0, 0, 0.6);
  }
  .power.on {
    color: var(--silkscreen);
    border-color: var(--led-r);
  }
  .pwr-label {
    font-size: 10px;
  }
  .source-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .source-toggle > .silkscreen {
    margin-right: 4px;
  }
  .src {
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    color: var(--silkscreen-dim);
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    position: relative;
  }
  .src.active {
    color: var(--silkscreen);
    border-color: var(--led-amber);
    box-shadow: 0 0 6px rgba(255, 179, 2, 0.45);
  }
  .src.exp .exp-tag {
    color: var(--neg-weight);
    margin-left: 4px;
    font-size: 8px;
  }
  .master {
    display: flex;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .section {
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    border-radius: 3px;
    padding: 4px 8px 6px;
    box-shadow: inset 0 1px 0 var(--rim-highlight);
  }
  .sec-label {
    font-size: 9px;
    display: block;
    margin-bottom: 2px;
  }
  .dials {
    display: flex;
    gap: 8px;
    justify-content: space-around;
  }
  .shortcuts {
    margin: auto 0 0 0;
    font-size: 8px;
    letter-spacing: 0.06em;
    text-transform: none;
    line-height: 1.4;
  }
</style>
