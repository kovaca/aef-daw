# AEF DAW - Geo FM radio synthesizarr

A synthy interface for noodling with [AlphaEarth Foundations](https://deepmind.google/discover/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/) — Google DeepMind's 64-dimensional satellite embeddings. Patch any of the 64 bands into R / G / B, sweep through annual snapshots from 2017–2025, sonify the map.

Live: <https://kovaca.github.io/aef-daw/>

## Modes

- **Basic** — one band per RGB output. Drag a band onto R, G, or B.
- **Advanced** — each output is a weighted linear combination of any subset of the 64 bands. Drag bands onto outputs, click cables to remove, turn knobs to weight.
- **Turbo** — Advanced + audio. Either one pentatonic voice per cable, or a wavetable read from the rendered map pixels. Press `Space` to start. Sonically, it's garbagesque.

Click an R/G/B output jack for a tooltip showing the per-channel math (bands, weights, rescale window, 8-bit framebuffer mapping).

## Data

The [AlphaEarth Foundations](https://deepmind.google/discover/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/) Satellite Embedding dataset is produced by Google and Google DeepMind. The GeoZarr mosaic is hosted on [Source Cooperative](https://source.coop/tge-labs/aef-mosaic) and processed by [Jeff](https://github.com/geospatial-jeff/aef-mosaic) and made possible by Taylor Geospatial Engine.

## Stack

[@developmentseed/deck.gl-raster](https://github.com/developmentseed/deck.gl-raster) with fresh new Zarr support for the GPU shader pipeline · [zarrita](https://github.com/manzt/zarrita.js) for zarr in the browser · WebAudio for the synth voice in Turbo mode · [SvelteKit](https://kit.svelte.dev) (Svelte 5 runes, static adapter) · [maplibre-gl](https://maplibre.org) basemap.

The shader pipeline lives in `src/lib/gpu/`:
- `sample-aef-rgb.ts` — basic mode; samples three layers of an int8 Texture2DArray, dequantizes, rescales.
- `mix-aef-rgb.ts` — advanced/turbo mode; weighted linear combination of all 64 bands per output channel via a small 64×3 r32float weights texture. Can I get a vec64 up in this glsl amitite?
