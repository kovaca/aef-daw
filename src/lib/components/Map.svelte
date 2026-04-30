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
    onMapCenter,
    onCanvasReady,
  }: {
    aef: MixState;
    onMapCenter?: (c: { lng: number; lat: number }) => void;
    onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  } = $props();

  let mapEl: HTMLDivElement;
  let map: MaplibreMap | null = null;
  let overlay: MapboxOverlay | null = null;


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
    const initial = aef.location;
    map = new MaplibreMap({
      container: mapEl,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" as unknown as StyleSpecification,
      center: [initial.longitude, initial.latitude],
      zoom: initial.zoom,
      attributionControl: { compact: true },

      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    if (onCanvasReady) onCanvasReady(map.getCanvas());
    overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay);
    if (onMapCenter) {
      const emit = () => {
        if (!map) return;
        const c = map.getCenter();
        onMapCenter({ lng: c.lng, lat: c.lat });
      };
      emit();
      map.on("moveend", emit);
    }
    void aef.load();
  });


  let lastLocation = untrack(() => aef.locationId);
  $effect(() => {
    const id = aef.locationId;
    if (!map) return;
    if (id === lastLocation) return;
    lastLocation = id;
    const next = aef.location;
    map.flyTo({
      center: [next.longitude, next.latitude],
      zoom: next.zoom,
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

    const layerProps = {
      id: `aef-zarr-layer-${useAdvanced ? "advanced" : "basic"}-${yearIdx}`,
      node: aef.arr,
      metadata: aef.rootAttrs,
      selection: aef.selection,
      getTileData,
      renderTile,
      minZoom: MIN_ZOOM,
      maxRequests: 20,
      maxCacheSize: 10,
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
  :global(.maplibregl-ctrl-attrib) {
    background: rgba(0, 0, 0, 0.5) !important;
    color: #aaa !important;
  }
  :global(.maplibregl-ctrl-attrib a) {
    color: #ccc !important;
  }
</style>
