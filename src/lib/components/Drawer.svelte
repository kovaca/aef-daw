<script lang="ts">
  import type { MixState } from "$lib/state.svelte.js";
  import type { TurboState } from "$lib/audio/turbo-state.svelte.js";
  import Switchboard from "./Switchboard.svelte";
  import ControlPanel from "./ControlPanel.svelte";
  import TurboPanel from "./TurboPanel.svelte";

  let {
    aef,
    turbo,
    onAbout,
  }: { aef: MixState; turbo: TurboState; onAbout: () => void } = $props();

  /**
   * Making this not terrible for touch devices is a little yikes.
   *  - Mobile (≤720px): snap targets at 28px / min(50vh, 360px) / 85vh.
   *  - Desktop: snap targets at 28px / 280px.
   */
  const COLLAPSED_PX = 28;
  const TAP_PX = 5; // movement threshold below which a pointerup is "tap"
  const DESKTOP_OPEN_PX = 280;

  let isMobile = $state(false);
  let viewportH = $state(800);

  $effect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    isMobile = mq.matches;
    viewportH = window.innerHeight;
    const onMqChange = (e: MediaQueryListEvent) => (isMobile = e.matches);
    const onResize = () => (viewportH = window.innerHeight);
    mq.addEventListener("change", onMqChange);
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener("resize", onResize);
    };
  });

  const targets = $derived(
    isMobile
      ? [
          COLLAPSED_PX,
          Math.min(viewportH * 0.5, 360),
          viewportH * 0.85,
        ]
      : [COLLAPSED_PX, DESKTOP_OPEN_PX],
  );

  // Default to first non-collapsed target. 
  let heightPx = $state(DESKTOP_OPEN_PX);
  let lastOpenPx = $state(DESKTOP_OPEN_PX);

  // open height to the nearest target for that viewport.
  $effect(() => {
    void isMobile;
    if (heightPx <= COLLAPSED_PX + 1) return;
    const nearest = nearestTarget(heightPx, targets);
    heightPx = nearest;
    lastOpenPx = nearest;
  });

  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--drawer-h",
      `${heightPx}px`,
    );
  });

  const collapsed = $derived(heightPx <= COLLAPSED_PX + 1);
  const ariaLabel = $derived(collapsed ? "Expand patchbay" : "Collapse patchbay");

  function nearestTarget(h: number, ts: readonly number[]): number {
    let best = ts[0]!;
    let bestD = Math.abs(h - best);
    for (const t of ts) {
      const d = Math.abs(h - t);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartH = 0;
  let dragMoved = false;

  function onPointerDown(ev: PointerEvent) {
    // Only respond to primary button / touch / pen.
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    ev.preventDefault();
    dragging = true;
    dragMoved = false;
    dragStartY = ev.clientY;
    dragStartH = heightPx;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent) {
    if (!dragging) return;
    const dy = ev.clientY - dragStartY;
    if (Math.abs(dy) > TAP_PX) dragMoved = true;
    if (!dragMoved) return;
    const maxPx = (typeof window !== "undefined" ? window.innerHeight : 1000) * 0.95;
    const next = Math.max(COLLAPSED_PX, Math.min(maxPx, dragStartH - dy));
    heightPx = next;
  }

  function onPointerUp(ev: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const target = ev.currentTarget as HTMLElement;
    if (target.hasPointerCapture(ev.pointerId)) {
      target.releasePointerCapture(ev.pointerId);
    }
    if (!dragMoved) {
      // Tap: toggle.
      if (collapsed) {
        heightPx = lastOpenPx;
      } else {
        lastOpenPx = heightPx;
        heightPx = COLLAPSED_PX;
      }
    } else {
      const snapped = nearestTarget(heightPx, targets);
      heightPx = snapped;
      if (snapped > COLLAPSED_PX + 1) lastOpenPx = snapped;
    }
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      if (collapsed) heightPx = lastOpenPx;
      else {
        lastOpenPx = heightPx;
        heightPx = COLLAPSED_PX;
      }
    }
  }
</script>

<div class="drawer" class:collapsed class:dragging>
  <!-- Panel screws — pure decoration. -->
  <span class="screw tl" aria-hidden="true"></span>
  <span class="screw tr" aria-hidden="true"></span>
  <span class="screw bl" aria-hidden="true"></span>
  <span class="screw br" aria-hidden="true"></span>

  <button
    class="handle"
    type="button"
    aria-label={ariaLabel}
    aria-expanded={!collapsed}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKey}
  >
    <span class="grip"></span>
    <span class="caret">{collapsed ? "▲" : "▼"}</span>
  </button>
  {#if !collapsed}
    <div class="body">
      <div class="switchboard-wrap">
        <Switchboard {aef} />
      </div>
      <ControlPanel {aef} {turbo} {onAbout} />
      {#if turbo.enabled}
        <TurboPanel {turbo} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .drawer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--drawer-h, 280px);
    background:
      linear-gradient(
        180deg,
        var(--panel-rim) 0%,
        var(--panel-body) 4px,
        var(--panel-body) 100%
      );
    border-top: 1px solid var(--panel-edge);
    box-shadow: inset 0 1px 0 var(--rim-highlight);
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: hidden;
  }
  .screw {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background:
      radial-gradient(
        circle at 35% 30%,
        #6c5d4c 0%,
        var(--screw) 55%,
        #2a221b 100%
      );
    box-shadow:
      inset 0 0 1px rgba(0, 0, 0, 0.7),
      0 1px 0 var(--rim-highlight);
    z-index: 2;
    pointer-events: none;
  }
  .screw.tl { top: 6px; left: 8px; }
  .screw.tr { top: 6px; right: 8px; }
  .screw.bl { bottom: 8px; left: 8px; }
  .screw.br { bottom: 8px; right: 8px; }
  .handle {
    height: 22px;
    flex: 0 0 22px;
    background: var(--panel-section);
    border: 0;
    border-bottom: 1px solid var(--panel-edge);
    color: var(--silkscreen-dim);
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0;
    font-size: 10px;
    touch-action: none;
    user-select: none;
  }
  .handle:hover {
    background: #2a221c;
  }
  .handle:hover .grip {
    background: var(--silkscreen-dim);
  }
  .drawer.dragging .handle {
    background: #2a221c;
  }
  .drawer.dragging .handle .grip {
    background: var(--led-amber);
    box-shadow: 0 0 4px var(--led-amber);
  }
  .grip {
    width: 60px;
    height: 4px;
    background: var(--screw);
    border-radius: 2px;
    transition: background 120ms;
  }
  .caret {
    font-size: 9px;
  }
  .body {
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
  }
  .switchboard-wrap {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }


  @media (max-width: 720px) {
    .body {
      flex-direction: column;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .switchboard-wrap {
      flex: 0 0 220px;
      width: 100%;
      border-bottom: 1px solid var(--panel-edge);
    }
  }
</style>
