<script lang="ts">
  let {
    min,
    max,
    step,
    low = $bindable(),
    high = $bindable(),
  }: {
    min: number;
    max: number;
    step: number;
    low: number;
    high: number;
  } = $props();

  function onLow(ev: Event) {
    const v = Number((ev.currentTarget as HTMLInputElement).value);
    low = Math.min(v, high - step);
  }
  function onHigh(ev: Event) {
    const v = Number((ev.currentTarget as HTMLInputElement).value);
    high = Math.max(v, low + step);
  }

  const span = $derived(max - min);
  const lowPct = $derived(span > 0 ? ((low - min) / span) * 100 : 0);
  const highPct = $derived(span > 0 ? ((high - min) / span) * 100 : 100);
</script>

<div class="dual-range">
  <div class="track"></div>
  <div
    class="fill"
    style:left="{lowPct}%"
    style:width="{Math.max(0, highPct - lowPct)}%"
  ></div>
  <input
    type="range"
    {min}
    {max}
    {step}
    value={low}
    oninput={onLow}
    aria-label="Rescale min"
  />
  <input
    type="range"
    {min}
    {max}
    {step}
    value={high}
    oninput={onHigh}
    aria-label="Rescale max"
  />
</div>

<style>
  .dual-range {
    position: relative;
    width: 100%;
    height: 22px;
  }
  .track {
    position: absolute;
    inset: 9px 0;
    background: var(--panel-edge);
    border-radius: 2px;
    height: 4px;
    box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.5);
  }
  .fill {
    position: absolute;
    top: 9px;
    height: 4px;
    background: var(--led-amber);
    border-radius: 2px;
    pointer-events: none;
    box-shadow: 0 0 4px rgba(255, 179, 2, 0.5);
  }
  input[type="range"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    pointer-events: none;
    margin: 0;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--knob-cap);
    border: 1.5px solid var(--knob-cap-shadow);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    cursor: pointer;
    pointer-events: auto;
    margin-top: 0;
  }
  input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--knob-cap);
    border: 1.5px solid var(--knob-cap-shadow);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    cursor: pointer;
    pointer-events: auto;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    background: transparent;
    height: 4px;
  }
  input[type="range"]::-moz-range-track {
    background: transparent;
    height: 4px;
  }
</style>
