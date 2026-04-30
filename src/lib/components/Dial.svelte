<script lang="ts">
  type Props = {
    value: number;
    min: number;
    max: number;
    step?: number;
    /** SVG size in px (square). Visual radius is size / 2 - 2. */
    size?: number;
    /** LED ring color around the knob; defaults to amber. */
    color?: string;
    /** Optional centered label below the knob. */
    label?: string;
    /** Optional value formatter; defaults to .toFixed(2). */
    format?: (v: number) => string;
    /** "linear" | "log" — log uses an exponential curve so the dial gives
        finer control near zero (good for cutoff/freq). */
    curve?: "linear" | "log";
    onChange: (v: number) => void;
  };

  let {
    value,
    min,
    max,
    step = (max - min) / 200,
    size = 44,
    color = "var(--led-amber)",
    label,
    format,
    curve = "linear",
    onChange,
  }: Props = $props();

  // Map [value] ↔ [0..1] normalized position with optional log curve.
  function toNorm(v: number): number {
    if (curve === "log") {
      const lo = Math.max(min, 1e-6);
      const hi = Math.max(max, lo * 1.0001);
      const lv = Math.max(v, lo);
      return (Math.log(lv) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
    }
    return (v - min) / (max - min);
  }
  function fromNorm(n: number): number {
    const cl = Math.max(0, Math.min(1, n));
    let raw: number;
    if (curve === "log") {
      const lo = Math.max(min, 1e-6);
      const hi = Math.max(max, lo * 1.0001);
      raw = Math.exp(Math.log(lo) + cl * (Math.log(hi) - Math.log(lo)));
    } else {
      raw = min + cl * (max - min);
    }
    return Math.round(raw / step) * step;
  }

  const norm = $derived(Math.max(0, Math.min(1, toNorm(value))));
  // Sweep from 7 o'clock (135°) clockwise to 5 o'clock (45°) — 270° total.
  const startDeg = 135;
  const sweepDeg = 270;
  const angle = $derived(startDeg + norm * sweepDeg);
  const radius = $derived(size / 2 - 4);
  const cx = $derived(size / 2);
  const cy = $derived(size / 2);

  // SVG arc path for the LED ring.
  const ringPath = $derived(
    arcPath(cx, cy, radius + 2, startDeg, startDeg + norm * sweepDeg),
  );
  const trackPath = $derived(
    arcPath(cx, cy, radius + 2, startDeg, startDeg + sweepDeg),
  );
  function polar(cxv: number, cyv: number, r: number, deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cxv + r * Math.cos(rad), y: cyv + r * Math.sin(rad) };
  }
  function arcPath(
    cxv: number,
    cyv: number,
    r: number,
    a0: number,
    a1: number,
  ): string {
    const start = polar(cxv, cyv, r, a0);
    const end = polar(cxv, cyv, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  // Drag-to-adjust: ~120 px of vertical sweep covers full range.
  const SENSITIVITY_PX = 120;
  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartNorm = 0;

  function onPointerDown(ev: PointerEvent) {
    ev.preventDefault();
    dragging = true;
    dragStartY = ev.clientY;
    dragStartNorm = norm;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev: PointerEvent) {
    if (!dragging) return;
    const dY = dragStartY - ev.clientY; // up = positive
    const next = fromNorm(dragStartNorm + dY / SENSITIVITY_PX);
    if (next !== value) onChange(next);
  }
  function onPointerUp(ev: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
    } catch {
      /* noop */
    }
  }
  function onKey(ev: KeyboardEvent) {
    let dn = 0;
    if (ev.key === "ArrowUp" || ev.key === "ArrowRight") dn = 0.02;
    else if (ev.key === "ArrowDown" || ev.key === "ArrowLeft") dn = -0.02;
    else return;
    ev.preventDefault();
    onChange(fromNorm(norm + dn));
  }

  const formatted = $derived(format ? format(value) : value.toFixed(2));
</script>

<div class="dial" style:--ring-color={color} style:width="{size}px">
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${size} ${size}`}
    role="slider"
    tabindex="0"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-label={label ?? "dial"}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onlostpointercapture={onPointerUp}
    onkeydown={onKey}
    class:dragging
  >
    <!-- LED ring track (dim) + active fill -->
    <path
      d={trackPath}
      stroke="var(--panel-edge)"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
    />
    <path
      d={ringPath}
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
      class="led"
    />
    <!-- Knob cap -->
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill="var(--knob-cap)"
      stroke="var(--knob-cap-shadow)"
      stroke-width="0.75"
    />
    <!-- Indicator notch -->
    <line
      x1={cx}
      y1={cy}
      x2={polar(cx, cy, radius - 3, angle).x}
      y2={polar(cx, cy, radius - 3, angle).y}
      stroke="var(--knob-indicator)"
      stroke-width="2"
      stroke-linecap="round"
    />
    <circle cx={cx} cy={cy} r="1.5" fill="var(--knob-indicator)" />
  </svg>
  {#if label}
    <span class="silkscreen label">{label}</span>
  {/if}
  <span class="value">{formatted}</span>
</div>

<style>
  .dial {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    user-select: none;
    touch-action: none;
  }
  svg {
    cursor: ns-resize;
    outline: none;
  }
  svg:focus-visible {
    filter: drop-shadow(0 0 3px var(--ring-color));
  }
  .led {
    filter: drop-shadow(0 0 2px var(--ring-color));
  }
  .label {
    font-size: 9px;
    margin-top: 2px;
  }
  .value {
    font-family: ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    color: var(--text);
    line-height: 1;
  }
</style>
