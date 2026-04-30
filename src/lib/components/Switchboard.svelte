<script lang="ts">
  import type { Channel, MixState } from "$lib/state.svelte.js";
  import { NUM_BANDS } from "$lib/aef/constants.js";
  import Cable from "./Cable.svelte";

  let { aef }: { aef: MixState } = $props();

  // Layout — wide horizontal patchbay; 64 input jacks across the top edge,
  // 3 RGB output jacks evenly across the bottom.
  const PAD_X = 32;
  const TOP_Y = 38;
  const BOTTOM_Y = 192;

  let svgEl: SVGSVGElement | undefined = $state(undefined);
  let svgWidth: number = $state(1200);

  $effect(() => {
    if (!svgEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0) svgWidth = e.contentRect.width;
      }
    });
    ro.observe(svgEl);
    return () => ro.disconnect();
  });

  const usableWidth = $derived(svgWidth - 2 * PAD_X);
  function bandX(i: number): number {
    return PAD_X + (usableWidth * i) / (NUM_BANDS - 1);
  }
  function channelX(ch: Channel): number {
    const t = ch === "r" ? 0.2 : ch === "g" ? 0.5 : 0.8;
    return PAD_X + usableWidth * t;
  }
  const channelColor = (ch: Channel) =>
    ch === "r"
      ? "var(--led-r)"
      : ch === "g"
        ? "var(--led-g)"
        : "var(--led-b)";

  type Drag = {
    band: number;
    cursor: { x: number; y: number };
  };
  let drag: Drag | null = $state(null);
  let hoveredBand: number | null = $state(null);

  function svgCoords(ev: PointerEvent): { x: number; y: number } {
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const xRatio = svgWidth / rect.width;
    const yRatio = (BOTTOM_Y + 32) / rect.height;
    return {
      x: (ev.clientX - rect.left) * xRatio,
      y: (ev.clientY - rect.top) * yRatio,
    };
  }

  function startDrag(band: number, ev: PointerEvent) {
    ev.preventDefault();
    drag = { band, cursor: svgCoords(ev) };
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  }
  function moveDrag(ev: PointerEvent) {
    if (!drag) return;
    drag = { ...drag, cursor: svgCoords(ev) };
  }
  function endDrag(ev: PointerEvent) {
    if (!drag) return;
    const cursor = svgCoords(ev);
    const channels: Channel[] = ["r", "g", "b"];
    let closest: { ch: Channel; dist: number } | null = null;
    for (const ch of channels) {
      const dx = cursor.x - channelX(ch);
      const dy = cursor.y - BOTTOM_Y;
      const d = Math.hypot(dx, dy);
      if (d < 32 && (!closest || d < closest.dist)) {
        closest = { ch, dist: d };
      }
    }
    if (closest) {
      aef.patchTo(closest.ch, drag.band, 1);
    }
    drag = null;
  }
</script>

<svg
  bind:this={svgEl}
  class="switchboard"
  role="application"
  aria-label="AEF channel patchbay"
  viewBox={`0 0 ${svgWidth} ${BOTTOM_Y + 32}`}
  preserveAspectRatio="none"
  onpointermove={moveDrag}
  onpointerup={endDrag}
>
  <defs>
    <!-- Soft drop-shadow under cables to give them physical droop. -->
    <filter id="cable-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" />
      <feOffset dy="1.5" result="offset" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.55" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <!-- Output jack rim gradient -->
    <radialGradient id="jack-rim" cx="0.4" cy="0.35">
      <stop offset="0%" stop-color="#3a322a" />
      <stop offset="100%" stop-color="#0d0a08" />
    </radialGradient>
  </defs>

  <!-- Section silkscreen rails -->
  <line
    x1={PAD_X}
    x2={svgWidth - PAD_X}
    y1={TOP_Y}
    y2={TOP_Y}
    stroke="var(--silkscreen-dim)"
    stroke-width="0.5"
    opacity="0.5"
  />
  <line
    x1={PAD_X}
    x2={svgWidth - PAD_X}
    y1={BOTTOM_Y}
    y2={BOTTOM_Y}
    stroke="var(--silkscreen-dim)"
    stroke-width="0.5"
    opacity="0.5"
  />

  <!-- Section labels -->
  <text x={PAD_X} y={TOP_Y - 22} class="silkscreen-text">INPUTS · A00–A63</text>
  <text x={PAD_X} y={BOTTOM_Y + 24} class="silkscreen-text">OUTPUTS</text>

  <!-- 64 input jacks along the top — outer ring + inner socket. -->
  {#each Array.from({ length: NUM_BANDS }) as _unused, i (i)}
    {@const x = bandX(i)}
    {@const label = aef.bandLabels?.[i] ?? `Band ${i}`}
    {@const isMajor = i % 8 === 0}
    <g
      class="jack"
      role="button"
      tabindex="0"
      aria-label={`Band A${String(i).padStart(2, "0")} - ${label}`}
      onpointerdown={(e) => startDrag(i, e)}
      onpointerenter={() => (hoveredBand = i)}
      onpointerleave={() => (hoveredBand = null)}
    >
      <rect
        x={x - 9}
        y={TOP_Y - 14}
        width="18"
        height="22"
        fill="transparent"
      />
      <!-- Outer ring -->
      <circle
        cx={x}
        cy={TOP_Y}
        r={isMajor ? 6 : 4.5}
        fill="url(#jack-rim)"
        stroke={hoveredBand === i ? "var(--silkscreen)" : "var(--panel-edge)"}
        stroke-width={hoveredBand === i ? 1 : 0.6}
      />
      <!-- Inner socket dot -->
      <circle
        cx={x}
        cy={TOP_Y}
        r={isMajor ? 2.4 : 1.8}
        fill="var(--panel-edge)"
      />
      {#if isMajor}
        <text x={x} y={TOP_Y - 9} text-anchor="middle" class="band-tick">
          A{String(i).padStart(2, "0")}
        </text>
      {/if}
    </g>
  {/each}

  <!-- Hovered-band detailed label -->
  {#if hoveredBand !== null}
    {@const x = bandX(hoveredBand)}
    {@const label = aef.bandLabels?.[hoveredBand] ?? `Band ${hoveredBand}`}
    <text x={x} y={TOP_Y + 22} text-anchor="middle" class="band-hover">
      A{String(hoveredBand).padStart(2, "0")} · {label}
    </text>
  {/if}

  <!-- Existing cables -->
  {#each ["r", "g", "b"] as ch (ch)}
    {#each [...aef.mix[ch as Channel].entries()] as [band, weight] (band)}
      <Cable
        from={{ x: bandX(band), y: TOP_Y + 7 }}
        to={{ x: channelX(ch as Channel), y: BOTTOM_Y - 16 }}
        {weight}
        channel={ch as Channel}
        editable={aef.isAdvancedish}
        onDelete={() => aef.removeCable(ch as Channel, band)}
        onWeightChange={(w) => aef.setCable(ch as Channel, band, w)}
      />
    {/each}
  {/each}

  <!-- Ghost cable while dragging -->
  {#if drag}
    {@const dy = Math.max(40, Math.abs(drag.cursor.y - TOP_Y) * 0.55)}
    <path
      d={`M ${bandX(drag.band)} ${TOP_Y + 7} C ${bandX(drag.band)} ${TOP_Y + 7 + dy}, ${drag.cursor.x} ${drag.cursor.y - dy}, ${drag.cursor.x} ${drag.cursor.y}`}
      stroke="var(--silkscreen-dim)"
      stroke-width="2"
      stroke-dasharray="6 4"
      fill="none"
      pointer-events="none"
    />
  {/if}

  <!-- 3 RGB output jacks: bigger socket rings glowing in their LED color. -->
  {#each ["r", "g", "b"] as ch (ch)}
    {@const x = channelX(ch as Channel)}
    {@const fill = channelColor(ch as Channel)}
    <g class="output-jack">
      <circle
        cx={x}
        cy={BOTTOM_Y}
        r="20"
        fill="url(#jack-rim)"
        stroke={fill}
        stroke-width="2.5"
        class="rim"
      />
      <circle cx={x} cy={BOTTOM_Y} r="9" fill={fill} class="led" />
      <text x={x} y={BOTTOM_Y + 32} text-anchor="middle" class="rgb-label" {fill}>
        {(ch as string).toUpperCase()}
      </text>
    </g>
  {/each}
</svg>

<style>
  .switchboard {
    width: 100%;
    height: 100%;
    user-select: none;
    touch-action: none;
    background:
      radial-gradient(
        ellipse at top,
        rgba(255, 255, 255, 0.025) 0%,
        transparent 60%
      ),
      linear-gradient(180deg, var(--panel-body) 0%, var(--panel-edge) 100%);
  }
  .jack {
    cursor: grab;
  }
  .jack:active {
    cursor: grabbing;
  }
  .band-tick {
    fill: var(--silkscreen);
    font-size: 9px;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.05em;
    pointer-events: none;
  }
  .band-hover {
    fill: var(--silkscreen);
    font-size: 11px;
    font-family: ui-monospace, monospace;
    pointer-events: none;
  }
  .silkscreen-text {
    fill: var(--silkscreen-dim);
    font-size: 9px;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    pointer-events: none;
  }
  .rgb-label {
    font-size: 14px;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.12em;
    pointer-events: none;
  }
  .output-jack .led {
    filter: drop-shadow(0 0 4px currentColor);
  }
  .output-jack .rim {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }
</style>
