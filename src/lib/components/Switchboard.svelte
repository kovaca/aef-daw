<script lang="ts">
  import type { Channel, MixState } from "$lib/state.svelte.js";
  import { NUM_BANDS } from "$lib/aef/constants.js";
  import Cable from "./Cable.svelte";

  let { aef }: { aef: MixState } = $props();

  // Tooltip on R/G/B output node — surfaces the per-channel patch math.
  let openChannel: Channel | null = $state(null);
  let tooltipScreen = $state<{ x: number; y: number } | null>(null);

  function jackScreenPos(ch: Channel): { x: number; y: number } | null {
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    const xRatio = rect.width / svgWidth;
    const yRatio = rect.height / (BOTTOM_Y + 32);
    return {
      x: rect.left + channelX(ch) * xRatio,
      y: rect.top + BOTTOM_Y * yRatio,
    };
  }

  function toggleChannelTooltip(ch: Channel, _ev: Event) {
    if (openChannel === ch) {
      openChannel = null;
      tooltipScreen = null;
      return;
    }
    openChannel = ch;
    tooltipScreen = jackScreenPos(ch);
  }

  // Reposition while open so the tooltip tracks scroll/drawer-resize.
  $effect(() => {
    if (openChannel === null) return;
    const ch = openChannel;
    void svgWidth;
    const reposition = () => {
      tooltipScreen = jackScreenPos(ch);
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  });

  // Dismiss on outside click / Escape.
  $effect(() => {
    if (openChannel === null) return;
    const onDocPointer = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (!t) return;
      if (t.closest(".rgb-tooltip")) return;
      if (t.closest(".output-jack")) return;
      openChannel = null;
      tooltipScreen = null;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        openChannel = null;
        tooltipScreen = null;
      }
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  });

  type CableRow = { band: number; weight: number; label: string };
  const openCables = $derived.by<CableRow[]>(() => {
    if (openChannel === null) return [];
    const entries = [...aef.mix[openChannel].entries()];
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return entries.map(([band, weight]) => ({
      band,
      weight,
      label: aef.bandLabels?.[band] ?? `Band ${band}`,
    }));
  });
  const rescaleSpan = $derived(aef.rescale[1] - aef.rescale[0]);

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
    {@const isOpen = openChannel === ch}
    <g
      class="output-jack"
      class:open={isOpen}
      role="button"
      tabindex="0"
      aria-label={`${(ch as string).toUpperCase()} output — show channel math`}
      aria-pressed={isOpen}
      onclick={(ev) => toggleChannelTooltip(ch as Channel, ev)}
      onkeydown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          toggleChannelTooltip(ch as Channel, ev);
        }
      }}
    >
      <circle
        cx={x}
        cy={BOTTOM_Y}
        r="20"
        fill="url(#jack-rim)"
        stroke={fill}
        stroke-width={isOpen ? 3.5 : 2.5}
        class="rim"
      />
      <circle cx={x} cy={BOTTOM_Y} r="9" fill={fill} class="led" />
      <text x={x} y={BOTTOM_Y + 32} text-anchor="middle" class="rgb-label" {fill}>
        {(ch as string).toUpperCase()}
      </text>
    </g>
  {/each}
</svg>

{#if openChannel && tooltipScreen}
  {@const ch = openChannel}
  {@const lo = aef.rescale[0]}
  {@const hi = aef.rescale[1]}
  <div
    class="rgb-tooltip"
    class:c-r={ch === "r"}
    class:c-g={ch === "g"}
    class:c-b={ch === "b"}
    style:left="{tooltipScreen.x}px"
    style:top="{tooltipScreen.y}px"
    role="dialog"
    aria-label="{ch.toUpperCase()} channel math"
  >
    <header>
      <span class="dot" aria-hidden="true"></span>
      <strong>{ch.toUpperCase()} output</strong>
      <button
        class="close"
        onclick={() => { openChannel = null; tooltipScreen = null; }}
        aria-label="Close"
      >×</button>
    </header>

    {#if openCables.length === 0}
      <p class="empty">No bands patched into this channel.</p>
    {:else}
      <div class="section-label">Bands → weight</div>
      <ul class="cables">
        {#each openCables as row (row.band)}
          <li>
            <span class="band-id">A{String(row.band).padStart(2, "0")}</span>
            <span class="band-label" title={row.label}>{row.label}</span>
            <span class="weight" class:neg={row.weight < 0}>
              {row.weight >= 0 ? "+" : ""}{row.weight.toFixed(2)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="section-label">Per-pixel math</div>
    <div class="math">
      <div><span class="lhs">v̂ᵢ</span> = (vᵢ / 127.5)² · sign(vᵢ)</div>
      <div><span class="lhs">accum</span> = Σ wᵢ · v̂ᵢ</div>
      <div>
        <span class="lhs">norm</span> = clamp((accum − {lo.toFixed(2)}) / {rescaleSpan.toFixed(2)}, 0, 1)
      </div>
      <div><span class="lhs">{ch.toUpperCase()}₈</span> = round(norm × 255)</div>
    </div>

    <div class="footer">
      Rescale window <strong>{lo.toFixed(2)} → {hi.toFixed(2)}</strong>
      maps to <strong>0 → 255</strong> (8-bit RGBA framebuffer).
    </div>
  </div>
{/if}

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
  .output-jack {
    cursor: pointer;
  }
  .output-jack:focus-visible .rim {
    stroke-width: 3.5;
  }
  .output-jack .led {
    filter: drop-shadow(0 0 4px currentColor);
  }
  .output-jack .rim {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    transition: stroke-width 120ms ease-out;
  }
  .output-jack.open .led {
    filter: drop-shadow(0 0 8px currentColor);
  }

  .rgb-tooltip {
    position: fixed;
    z-index: 2000;
    transform: translate(-50%, calc(-100% - 28px));
    width: min(320px, calc(100vw - 24px));
    max-height: min(60vh, 420px);
    overflow-y: auto;
    background: rgba(20, 16, 14, 0.96);
    border: 1px solid var(--panel-edge);
    border-top-width: 2px;
    border-radius: 6px;
    color: var(--silkscreen);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.45;
    padding: 10px 12px 12px;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 var(--rim-highlight);
    backdrop-filter: blur(6px);
  }
  .rgb-tooltip.c-r { border-top-color: var(--led-r); }
  .rgb-tooltip.c-g { border-top-color: var(--led-g); }
  .rgb-tooltip.c-b { border-top-color: var(--led-b); }
  /* Caret-down arrow tying the tooltip back to the jack. */
  .rgb-tooltip::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -6px;
    width: 10px;
    height: 10px;
    background: rgba(20, 16, 14, 0.96);
    border-right: 1px solid var(--panel-edge);
    border-bottom: 1px solid var(--panel-edge);
    transform: translateX(-50%) rotate(45deg);
  }
  .rgb-tooltip header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--panel-edge);
    margin-bottom: 8px;
  }
  .rgb-tooltip header strong {
    flex: 1 1 auto;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--silkscreen);
  }
  .rgb-tooltip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
  }
  .rgb-tooltip.c-r .dot { background: var(--led-r); color: var(--led-r); }
  .rgb-tooltip.c-g .dot { background: var(--led-g); color: var(--led-g); }
  .rgb-tooltip.c-b .dot { background: var(--led-b); color: var(--led-b); }
  .rgb-tooltip .close {
    background: transparent;
    border: 0;
    color: var(--silkscreen-dim);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .rgb-tooltip .close:hover { color: var(--led-amber); }

  .rgb-tooltip .section-label {
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--silkscreen-dim);
    margin: 8px 0 4px;
  }
  .rgb-tooltip .section-label:first-of-type { margin-top: 0; }

  .rgb-tooltip .empty {
    margin: 0;
    color: var(--silkscreen-dim);
    font-style: italic;
  }

  .rgb-tooltip .cables {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rgb-tooltip .cables li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: baseline;
  }
  .rgb-tooltip .band-id {
    color: var(--silkscreen);
    font-weight: 500;
  }
  .rgb-tooltip .band-label {
    color: var(--silkscreen-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rgb-tooltip .weight {
    color: var(--led-g);
    font-variant-numeric: tabular-nums;
  }
  .rgb-tooltip .weight.neg { color: var(--led-r); }

  .rgb-tooltip .math {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--silkscreen);
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 10.5px;
  }
  .rgb-tooltip .math .lhs {
    color: var(--led-amber);
    display: inline-block;
    min-width: 44px;
    font-style: italic;
  }

  .rgb-tooltip .footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--panel-edge);
    color: var(--silkscreen-dim);
    font-size: 10px;
  }
  .rgb-tooltip .footer strong {
    color: var(--silkscreen);
    font-weight: 500;
  }
</style>
