<script lang="ts">
  import { untrack } from "svelte";
  import type { Mode, MixState } from "$lib/state.svelte.js";
  import type { TurboState } from "$lib/audio/turbo-state.svelte.js";
  import { LOCATIONS } from "$lib/aef/locations.js";
  import { NUM_YEARS, YEAR_ORIGIN } from "$lib/aef/constants.js";
  import DualRangeSlider from "./DualRangeSlider.svelte";

  let {
    aef,
    turbo,
    onAbout,
  }: { aef: MixState; turbo: TurboState; onAbout: () => void } = $props();

  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.warn("[aef-daw] clipboard write failed", err);
    }
  }

  function selectMode(m: Mode) {
    aef.setMode(m);
    // Turbo mode also reveals the turbo pane (and audio/dial state).
    turbo.enabled = m === "turbo";
  }

  let lowProxy = $state(untrack(() => aef.rescale[0]));
  let highProxy = $state(untrack(() => aef.rescale[1]));

  // Pick the preset whose coords + zoom are closest to the current view, if any.
  // Latitude correction keeps the threshold roughly screen-relative away from the equator.
  // Tolerances are loose so a small pan from a preset still keeps it selected.
  const closestPresetId = $derived.by(() => {
    const lng = aef.lng;
    const lat = aef.lat;
    const zoom = aef.zoom;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    let best: { id: string; d: number } | null = null;
    for (const p of LOCATIONS) {
      const dLng = (p.longitude - lng) * cosLat;
      const dLat = p.latitude - lat;
      const d = Math.hypot(dLng, dLat);
      const dz = Math.abs(p.zoom - zoom);
      if (d < 0.5 && dz < 1.5 && (!best || d < best.d)) {
        best = { id: p.id, d };
      }
    }
    return best?.id ?? "";
  });

  $effect(() => {
    if (lowProxy !== aef.rescale[0] || highProxy !== aef.rescale[1]) {
      aef.rescale = [lowProxy, highProxy];
    }
  });
  $effect(() => {
    const [a, b] = aef.rescale;
    if (a !== lowProxy) lowProxy = a;
    if (b !== highProxy) highProxy = b;
  });
</script>

<div class="control-panel">
  <header>
    <span class="title">AEF DAW</span>
  </header>

  <div class="mode-row" role="radiogroup" aria-label="Mode">
    <button
      class="mode-btn basic"
      class:active={aef.mode === "basic"}
      onclick={() => selectMode("basic")}
      role="radio"
      aria-checked={aef.mode === "basic"}
    >
      <span class="led" aria-hidden="true"></span>
      <span class="lbl">BASIC</span>
    </button>
    <button
      class="mode-btn advanced"
      class:active={aef.mode === "advanced"}
      onclick={() => selectMode("advanced")}
      role="radio"
      aria-checked={aef.mode === "advanced"}
    >
      <span class="led" aria-hidden="true"></span>
      <span class="lbl">ADV</span>
    </button>
    <button
      class="mode-btn turbo"
      class:active={aef.mode === "turbo"}
      onclick={() => selectMode("turbo")}
      role="radio"
      aria-checked={aef.mode === "turbo"}
    >
      <span class="led" aria-hidden="true"></span>
      <span class="lbl">TURBO</span>
    </button>
  </div>

  <label>
    <span>Location</span>
    <select
      value={closestPresetId}
      onchange={(e) => {
        const t = e.currentTarget;
        if (t.value) aef.flyToPreset(t.value);
      }}
    >
      {#if !closestPresetId}
        <option value="">— custom view —</option>
      {/if}
      {#each LOCATIONS as l (l.id)}
        <option value={l.id}>{l.label}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>Year <strong>{YEAR_ORIGIN + aef.yearIdx}</strong></span>
    <input
      type="range"
      min={0}
      max={NUM_YEARS - 1}
      step={1}
      bind:value={aef.yearIdx}
      aria-label="Year"
    />
  </label>

  <label>
    <span>
      Rescale
      <strong>{lowProxy.toFixed(2)} – {highProxy.toFixed(2)}</strong>
    </span>
    <DualRangeSlider min={-1} max={1} step={0.01} bind:low={lowProxy} bind:high={highProxy} />
  </label>

  <div class="action-row">
    <button class="action share" onclick={copyShareUrl}>
      {copied ? "COPIED" : "SHARE"}
    </button>
    <button class="action about" onclick={onAbout}>ABOUT</button>
  </div>

  <p class="hint">
    {#if aef.mode === "basic"}
      drag a band onto R, G, or B to patch.
    {:else if aef.mode === "advanced"}
      drag bands onto outputs · click a cable to remove · turn knobs to weight.
    {:else}
      turbo · drag bands · turn FX dials · press POWER to hear it.
    {/if}
  </p>
</div>

<style>
  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    /* Lock width so flex doesn't shrink the panel when the switchboard's
       SVG content is wider than the available space. */
    flex: 0 0 320px;
    width: 320px;
    box-sizing: border-box;
    background: var(--panel-body);
    border-left: 1px solid var(--panel-edge);
    box-shadow: inset 1px 0 0 var(--rim-highlight);
    height: 100%;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .title {
    font-family: "Inter", -apple-system, "Helvetica Neue", sans-serif;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.18em;
    color: var(--silkscreen);
    text-transform: uppercase;
  }
  .mode-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    border-radius: 3px;
    padding: 6px 4px;
    cursor: pointer;
    color: var(--silkscreen-dim);
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    transition: color 120ms, border-color 120ms, box-shadow 120ms;
  }
  .mode-btn .led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--panel-edge);
    box-shadow: inset 0 0 1px rgba(0, 0, 0, 0.6);
  }
  /* When active, the LED lights up in the section color. */
  .mode-btn.basic.active {
    color: var(--silkscreen);
    border-color: var(--led-g);
  }
  .mode-btn.basic.active .led {
    background: var(--led-g);
    box-shadow: 0 0 6px var(--led-g);
  }
  .mode-btn.advanced.active {
    color: var(--silkscreen);
    border-color: var(--led-amber);
  }
  .mode-btn.advanced.active .led {
    background: var(--led-amber);
    box-shadow: 0 0 6px var(--led-amber);
  }
  .mode-btn.turbo.active {
    color: var(--silkscreen);
    border-color: var(--led-r);
  }
  .mode-btn.turbo.active .led {
    background: var(--led-r);
    box-shadow: 0 0 6px var(--led-r);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    color: var(--silkscreen-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  label > span {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  label strong {
    color: var(--text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-transform: none;
    letter-spacing: 0;
  }
  select,
  input[type="range"] {
    width: 100%;
  }
  .action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .action {
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    color: var(--silkscreen);
    border-radius: 3px;
    padding: 6px;
    cursor: pointer;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    transition: border-color 120ms, color 120ms;
  }
  .action:hover {
    border-color: var(--led-amber);
    color: var(--led-amber);
  }
  .hint {
    font-size: 10px;
    color: var(--silkscreen-dim);
    line-height: 1.45;
    margin: 0;
    margin-top: auto;
    font-family: ui-monospace, monospace;
  }

  @media (max-width: 720px) {
    .control-panel {
      flex: 0 0 auto;
      width: 100%;
      height: auto;
      gap: 12px;
      padding: 16px 16px 18px;
      border-left: 0;
      box-shadow: none;
    }
    .hint {
      margin-top: 4px;
    }
  }
</style>
