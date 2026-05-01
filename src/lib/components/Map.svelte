<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { browser } from "$app/environment";
  import { Map as MaplibreMap, type StyleSpecification } from "maplibre-gl";
  import { MapboxOverlay } from "@deck.gl/mapbox";
  import { ZarrLayer } from "@developmentseed/deck.gl-zarr";
  import type { Device, Texture } from "@luma.gl/core";
  import "maplibre-gl/dist/maplibre-gl.css";
  import type { MixState } from "$lib/state.svelte.js";
  import { getTileData as rawGetTileData } from "$lib/aef/get-tile-data.js";
  import {
    makeAdvancedRenderTile,
    makeBasicRenderTile,
  } from "$lib/aef/render-tile.js";
  import { MIN_ZOOM, NUM_BANDS } from "$lib/aef/constants.js";

  let {
    aef,
    onCanvasReady,
  }: {
    aef: MixState;
    onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  } = $props();

  let mapEl: HTMLDivElement;
  let map: MaplibreMap | null = null;
  let overlay: MapboxOverlay | null = null;

  // Track the last view we wrote into state from a map gesture, so the
  // state→map flyTo effect can distinguish "user just panned" (skip flyTo)
  // from "external code set new coords" (do flyTo).
  let lastEmittedLng = untrack(() => aef.lng);
  let lastEmittedLat = untrack(() => aef.lat);
  let lastEmittedZoom = untrack(() => aef.zoom);

  let lowZoomDismissed = $state(false);
  let lowZoom = $derived(aef.zoom <= 12);

  let device: Device | null = $state(null);
  let weightsTex: Texture | null = $state(null);


  function getTileData(
    arr: Parameters<typeof rawGetTileData>[0],
    options: Parameters<typeof rawGetTileData>[1],
  ) {
    if (!device) device = options.device;
    return rawGetTileData(arr, options);
  }

  onMount(() => {
    if (!browser) return;
    map = new MaplibreMap({
      container: mapEl,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" as unknown as StyleSpecification,
      center: [untrack(() => aef.lng), untrack(() => aef.lat)],
      zoom: untrack(() => aef.zoom),
      attributionControl: { compact: true },

      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    if (onCanvasReady) onCanvasReady(map.getCanvas());
    overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);

    // Push map gestures into state, rAF-coalesced so a pan doesn't run the
    // reactive graph (and URL writer) on every render frame.
    let moveRaf: number | null = null;
    map.on("move", () => {
      if (moveRaf !== null) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null;
        if (!map) return;
        const c = map.getCenter();
        const z = map.getZoom();
        lastEmittedLng = c.lng;
        lastEmittedLat = c.lat;
        lastEmittedZoom = z;
        aef.lng = c.lng;
        aef.lat = c.lat;
        aef.zoom = z;
      });
    });

    void aef.load();
  });

  // External coord changes (preset jump, applyHash) -> flyTo. We compare
  // against the last value emitted by the map itself; if state matches the
  // map, the change came from a gesture and we skip.
  $effect(() => {
    const lng = aef.lng;
    const lat = aef.lat;
    const zoom = aef.zoom;
    if (!map) return;
    if (
      Math.abs(lng - lastEmittedLng) < 1e-6 &&
      Math.abs(lat - lastEmittedLat) < 1e-6 &&
      Math.abs(zoom - lastEmittedZoom) < 1e-3
    ) {
      return;
    }
    lastEmittedLng = lng;
    lastEmittedLat = lat;
    lastEmittedZoom = zoom;
    map.flyTo({
      center: [lng, lat],
      zoom,
      duration: 500,
      essential: true,
    });
  });

 
  // Still rAF-coalesced because pointermove can fire >> display rate.
  $effect(() => {
    const r = aef.rWeightsDense;
    const g = aef.gWeightsDense;
    const b = aef.bWeightsDense;
    const dev = device;
    if (!dev) return;

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const packed = new Float32Array(NUM_BANDS * 3);
      packed.set(r, 0);
      packed.set(g, NUM_BANDS);
      packed.set(b, NUM_BANDS * 2);

      const existing = untrack(() => weightsTex);
      if (!existing) {
        weightsTex = dev.createTexture({
          dimension: "2d",
          format: "r32float",
          width: NUM_BANDS,
          height: 3,
          mipLevels: 1,
          data: packed,
          sampler: {
            minFilter: "nearest",
            magFilter: "nearest",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
          },
        });

      } else {
        existing.copyImageData({ data: packed });
        map?.triggerRepaint();
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  });

  // Layer rebuild whenever mode/mix/year/rescale/data change.
  $effect(() => {
    if (!overlay) return;
    if (!aef.arr || !aef.rootAttrs) {
      overlay.setProps({ layers: [] });
      return;
    }
    const mode = aef.mode;
    const yearIdx = aef.yearIdx;
    const rescaleMin = aef.rescale[0];
    const rescaleMax = aef.rescale[1];

    const useAdvanced =
      (mode === "advanced" || mode === "turbo") && !!weightsTex;
    const renderTile = useAdvanced
      ? makeAdvancedRenderTile({
          weightsTex: weightsTex!,
          rescaleMin,
          rescaleMax,
        })
      : makeBasicRenderTile({
          rBandIdx: aef.basicBand("r"),
          gBandIdx: aef.basicBand("g"),
          bBandIdx: aef.basicBand("b"),
          rescaleMin,
          rescaleMax,
        });

    // Layer id is intentionally stable across mode (basic / advanced / turbo)
    // — those only change the GPU shader pipeline, not the tile data, so
    // there's no reason to drop the tile cache. We do still rebuild on year
    // change because that selects a different time slice of the array.
    // Mode-driven shader swaps go through `updateTriggers.renderTile`.
    const layerProps = {
      id: `aef-zarr-layer-${yearIdx}`,
      node: aef.arr,
      metadata: aef.rootAttrs,
      selection: aef.selection,
      getTileData,
      renderTile,
      minZoom: MIN_ZOOM,
      maxRequests: 20,
      // ~256×256×64 bytes per tile = 4MB on the GPU, 
      // so 64 tiles ≈ 256MB - seems fine but eh?
      maxCacheSize: 64,
      updateTriggers: {
        renderTile: [
          mode,
          weightsTex,
          aef.basicBand("r"),
          aef.basicBand("g"),
          aef.basicBand("b"),
          rescaleMin,
          rescaleMax,
        ],
      },
      beforeId: "boundary_country_outline",
    };

    const layer = new ZarrLayer(layerProps as unknown as ConstructorParameters<
      typeof ZarrLayer
    >[0]);

    overlay.setProps({ layers: [layer] });
  });

  onDestroy(() => {
    if (overlay && map) {
      try {
        map.removeControl(overlay);
      } catch {
        /* noop */
      }
    }
    map?.remove();
    map = null;
    overlay = null;
    weightsTex?.destroy();
    weightsTex = null;
    device = null;
  });
</script>

<div bind:this={mapEl} class="map"></div>

{#if lowZoom && !lowZoomDismissed && !aef.loadError}
  <div class="low-zoom-warn" role="status" aria-live="polite">
    <span class="dot" aria-hidden="true"></span>
    <span class="msg">
      Low zoom — AEF chunks have no overviews and load slowly. Zoom in for snappier rendering.
    </span>
    <button
      class="dismiss"
      aria-label="Dismiss low-zoom warning"
      onclick={() => (lowZoomDismissed = true)}
    >×</button>
  </div>
{/if}

{#if aef.loadError}
  <div class="error">
    <strong>Failed to load AEF data.</strong>
    <span>{aef.loadError}</span>
  </div>
{/if}

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .error {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(120, 0, 0, 0.9);
    color: white;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1500;
    max-width: 80%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .low-zoom-warn {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1400;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: min(420px, calc(100% - 24px));
    padding: 6px 8px 6px 10px;
    background: rgba(20, 16, 14, 0.78);
    border: 1px solid var(--led-amber, #c79431);
    border-radius: 4px;
    color: var(--silkscreen, #d6c8b3);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.35;
    backdrop-filter: blur(4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .low-zoom-warn .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--led-amber, #c79431);
    box-shadow: 0 0 6px var(--led-amber, #c79431);
    flex: 0 0 auto;
  }
  .low-zoom-warn .msg {
    flex: 1 1 auto;
  }
  .low-zoom-warn .dismiss {
    flex: 0 0 auto;
    background: transparent;
    border: 0;
    color: var(--silkscreen-dim, #9a8c75);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .low-zoom-warn .dismiss:hover {
    color: var(--led-amber, #c79431);
  }
  @media (max-width: 720px) {
    .low-zoom-warn {
      top: 8px;
      left: 8px;
      right: 8px;
      max-width: none;
      font-size: 10px;
    }
  }
  :global(.maplibregl-ctrl-attrib) {
    background: rgba(0, 0, 0, 0.5) !important;
    color: #aaa !important;
  }
  :global(.maplibregl-ctrl-attrib a) {
    color: #ccc !important;
  }
</style>
