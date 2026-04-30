<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { MixState } from "$lib/state.svelte.js";
  import { TurboState } from "$lib/audio/turbo-state.svelte.js";
  import { audioEngine } from "$lib/audio/engine.js";
  import { applyHash, serialize } from "$lib/url-sync.js";
  import Map from "$lib/components/Map.svelte";
  import Drawer from "$lib/components/Drawer.svelte";
  import AboutModal from "$lib/components/AboutModal.svelte";

  const aef = new MixState();
  const turbo = new TurboState();
  let aboutOpen = $state(false);


  // Write hash on every aef change (rAF-debounced).
  let raf: number | null = null;
  $effect(() => {
    void aef.mode;
    void aef.yearIdx;
    void aef.locationId;
    void aef.rescale[0];
    void aef.rescale[1];
    void aef.mix.r;
    void aef.mix.g;
    void aef.mix.b;
    if (!browser) return;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const hash = "#" + serialize(aef);
      if (window.location.hash !== hash) {
        history.replaceState(null, "", hash);
      }
    });
  });

  // Push state changes into the audio engine. The engine handles its own
  // graph build on first start(); before that, sync() is a no-op except for
  // the master ramp (which also no-ops without a master node).
  $effect(() => {
    void aef.mix.r;
    void aef.mix.g;
    void aef.mix.b;
    void aef.yearIdx;
    void turbo.enabled;
    void turbo.playing;
    void turbo.sourceMode;
    void turbo.master;
    void turbo.cutoff;
    void turbo.resonance;
    void turbo.attack;
    void turbo.release;
    void turbo.drive;
    void turbo.delayTime;
    void turbo.delayFeedback;
    void turbo.reverbMix;
    if (!browser) return;
    void audioEngine.sync(aef, turbo);
  });

  function onMapCanvas(canvas: HTMLCanvasElement) {
    audioEngine.setMapCanvas(canvas);
  }

  // Keyboard shortcuts. Skip when an input/select is focused so typing in
  // the location dropdown or sliders doesn't fire mode swaps.
  function onKey(ev: KeyboardEvent) {
    const t = ev.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable)
    ) {
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    switch (ev.key) {
      case "1":
        aef.setMode("basic");
        turbo.enabled = false;
        break;
      case "2":
        aef.setMode("advanced");
        turbo.enabled = false;
        break;
      case "3":
        aef.setMode("turbo");
        turbo.enabled = true;
        break;
      case " ":
        if (!turbo.enabled) return;
        ev.preventDefault();
        if (turbo.playing) {
          turbo.playing = false;
          void audioEngine.suspend();
        } else {
          void audioEngine.start().then(() => (turbo.playing = true));
        }
        break;
      case "s":
      case "S":
        if (!turbo.enabled) return;
        turbo.sourceMode = turbo.sourceMode === "cables" ? "pixels" : "cables";
        break;
      case "[":
        if (!turbo.enabled) return;
        turbo.master = Math.max(0, +(turbo.master - 0.05).toFixed(2));
        break;
      case "]":
        if (!turbo.enabled) return;
        turbo.master = Math.min(1, +(turbo.master + 0.05).toFixed(2));
        break;
      case "m":
      case "M":
        if (!turbo.enabled) return;
        if (turbo.master > 0) {
          mutedFromMaster = turbo.master;
          turbo.master = 0;
        } else {
          turbo.master = mutedFromMaster || 0.7;
        }
        break;
    }
  }
  let mutedFromMaster = 0.7;

  onMount(() => {
    if (!browser) return;
    if (window.location.hash.length > 1) {
      applyHash(aef, window.location.hash);
    }
    if (aef.mode === "turbo") turbo.enabled = true;
    window.addEventListener("keydown", onKey);
  });

  onDestroy(() => {
    if (browser) window.removeEventListener("keydown", onKey);
    audioEngine.destroy();
  });
</script>

<div class="app-shell">
  <div class="map-region">
    <Map {aef} onCanvasReady={onMapCanvas} />
  </div>
  <Drawer {aef} {turbo} onAbout={() => (aboutOpen = true)} />
</div>

<AboutModal open={aboutOpen} onClose={() => (aboutOpen = false)} />

<style>
  .app-shell {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
  .map-region {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--drawer-h, 280px);
    transition: bottom 180ms ease-out;
  }
</style>
