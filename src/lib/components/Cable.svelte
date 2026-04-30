<script lang="ts">
  import type { Channel } from "$lib/state.svelte.js";

  type Point = { x: number; y: number };
  let {
    from,
    to,
    weight,
    channel,
    editable,
    onDelete,
    onWeightChange,
  }: {
    from: Point;
    to: Point;
    weight: number;
    channel: Channel;
    editable: boolean;
    onDelete: () => void;
    onWeightChange: (w: number) => void;
  } = $props();

  const channelColor = $derived(
    channel === "r"
      ? "var(--led-r)"
      : channel === "g"
        ? "var(--led-g)"
        : "var(--led-b)",
  );

  // Cubic bezier with vertical droop. Control points are pulled along the
  // Y-axis so cables fall like patch cables when source sits above target.
  const dy = $derived(Math.max(40, Math.abs(to.y - from.y) * 0.55));
  const path = $derived(
    `M ${from.x} ${from.y} C ${from.x} ${from.y + dy}, ${to.x} ${to.y - dy}, ${to.x} ${to.y}`,
  );

  // Bezier midpoint at t=0.5 — used for the rotary knob position.
  const midPoint = $derived({
    x: (from.x + to.x) / 2,
    y: (from.y + 3 * (from.y + dy) + 3 * (to.y - dy) + to.y) / 8,
  });

  const MIN_STROKE = 1.8;
  const MAX_STROKE = 12;
  const strokeWidth = $derived(
    editable
      ? Math.max(MIN_STROKE, Math.min(MAX_STROKE, Math.abs(weight) * 4))
      : 3.5,
  );
  const opacity = $derived(
    editable
      ? Math.min(1, Math.max(0.32, Math.abs(weight) * 0.85 + 0.15))
      : 0.95,
  );
  const isNegative = $derived(editable && weight < 0);
  const cableStroke = $derived(isNegative ? "var(--neg-weight)" : channelColor);

  // Drag-to-adjust: vertical pointer movement → weight delta. ~80 px = 1.0.
  const SENSITIVITY = 0.0125;
  const WEIGHT_MIN = -5;
  const WEIGHT_MAX = 5;
  const SNAP_STEP = 0.05;

  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartWeight = 0;
  let dragMoved = false;

  // Rotary indicator angle: weight 0 = top (-90°), full positive = +135°,
  // full negative = -225°. Just used for the visible notch direction; drag
  // sensitivity is unchanged.
  const indicatorAngle = $derived(
    -90 + (weight / WEIGHT_MAX) * 135,
  );

  function onHandlePointerDown(ev: PointerEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    dragging = true;
    dragMoved = false;
    dragStartY = ev.clientY;
    dragStartWeight = weight;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  }
  function onHandlePointerMove(ev: PointerEvent) {
    if (!dragging) return;
    const dY = dragStartY - ev.clientY;
    if (Math.abs(dY) > 1) dragMoved = true;
    const raw = dragStartWeight + dY * SENSITIVITY;
    const clamped = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, raw));
    const snapped = Math.round(clamped / SNAP_STEP) * SNAP_STEP;
    if (snapped !== weight) onWeightChange(snapped);
  }
  function onHandlePointerUp(ev: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
    } catch {
      /* noop */
    }
  }

  function onPathClick() {
    if (dragging || dragMoved) return;
    onDelete();
  }
</script>

<g class="cable" data-channel={channel}>
  <!-- Transparent wide hit target for delete-on-click. -->
  <path
    d={path}
    stroke="transparent"
    stroke-width="14"
    fill="none"
    style="cursor: pointer;"
    onclick={onPathClick}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete();
      }
    }}
    role="button"
    tabindex="0"
    aria-label={`Remove cable to ${channel.toUpperCase()}`}
  ></path>
  <!-- Visible cable; thickness reads as weight magnitude. -->
  <path
    d={path}
    stroke={cableStroke}
    stroke-width={strokeWidth}
    stroke-dasharray={isNegative ? "5 4" : undefined}
    stroke-linecap="round"
    fill="none"
    opacity={opacity}
    pointer-events="none"
    filter="url(#cable-shadow)"
  ></path>
  {#if editable}
    <!-- Rotary knob at curve midpoint. Cream cap + dark indicator notch +
         channel-color LED ring. Drag vertical to change weight. -->
    <g
      class="handle"
      class:dragging
      transform={`translate(${midPoint.x}, ${midPoint.y})`}
    >
      <circle
        cx="0"
        cy="0"
        r="13"
        fill="transparent"
        style="cursor: ns-resize;"
        onpointerdown={onHandlePointerDown}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
        onpointercancel={onHandlePointerUp}
        onlostpointercapture={onHandlePointerUp}
        role="slider"
        tabindex="0"
        aria-label={`Weight for ${channel.toUpperCase()}`}
        aria-valuemin={WEIGHT_MIN}
        aria-valuemax={WEIGHT_MAX}
        aria-valuenow={weight}
      ></circle>
      <!-- LED ring -->
      <circle
        cx="0"
        cy="0"
        r="9"
        fill="none"
        stroke={cableStroke}
        stroke-width="1.25"
        opacity="0.85"
        pointer-events="none"
        class="ring"
      />
      <!-- Cream knob cap -->
      <circle
        cx="0"
        cy="0"
        r="7"
        fill="var(--knob-cap)"
        stroke="var(--knob-cap-shadow)"
        stroke-width="0.5"
        pointer-events="none"
      />
      <!-- Indicator notch -->
      <line
        x1="0"
        y1="0"
        x2={4 * Math.cos((indicatorAngle * Math.PI) / 180)}
        y2={4 * Math.sin((indicatorAngle * Math.PI) / 180)}
        stroke="var(--knob-indicator)"
        stroke-width="1.6"
        stroke-linecap="round"
        pointer-events="none"
      />
      <text
        x={0}
        y={20}
        text-anchor="middle"
        class="weight-label"
        style:fill={cableStroke}
      >{weight.toFixed(2)}</text>
    </g>
  {/if}
</g>

<style>
  .handle .ring {
    filter: drop-shadow(0 0 1.5px currentColor);
  }
  .handle.dragging .ring {
    opacity: 1;
    stroke-width: 1.6;
  }
  .handle .weight-label {
    font-size: 9px;
    font-family: ui-monospace, monospace;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.85);
    stroke-width: 2px;
    stroke-linejoin: round;
  }
</style>
