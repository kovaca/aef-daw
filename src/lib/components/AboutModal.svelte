<script lang="ts">
  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  let dialogEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Move focus to the close button so ESC + Tab work naturally.
    queueMicrotask(() =>
      dialogEl?.querySelector<HTMLButtonElement>(".close")?.focus(),
    );
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function onBackdropClick(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) onClose();
  }
</script>

{#if open}
  <div
    class="backdrop"
    role="presentation"
    onclick={onBackdropClick}
    onkeydown={() => {}}
  >
    <div
      bind:this={dialogEl}
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <span class="screw tl" aria-hidden="true"></span>
      <span class="screw tr" aria-hidden="true"></span>
      <span class="screw bl" aria-hidden="true"></span>
      <span class="screw br" aria-hidden="true"></span>

      <header>
        <h2 id="about-title" class="title">Digital AEF Workstation</h2>
        <button class="close" onclick={onClose} aria-label="Close">×</button>
      </header>

      <div class="body">
        <section>
          <h3 class="silkscreen">WHAT</h3>
          <p>
            A synthesizarr for jamming on 
            <strong>AlphaEarth Foundations</strong> — Google DeepMind's
            64-dimensional satellite embeddings. Have you ever wanted to just 
            mix a bunch of those channels into R / G / B and poke around with 
            knobs and dials and see what happens? Me too.
          </p>
          <p>
            "Turbo" mode adds sonification, either as one pentatonic voice per cable, or as a
            wavetable read from the rendered map pixels. It's not actually good, but it is quite literally a vibe.
          </p>
          <p> And why? Kyle posted an <a href="https://bsky.app/profile/kylebarron.dev/post/3mknp2btsvk2j" target="_blank" rel="noopener noreferrer">absolutely righteous gif</a> announcing Zarr support in deck.gl-raster 
            and this was the obvious play. </p>
        </section>

        <section>
          <h3 class="silkscreen">DATA</h3>
          <ul>
            
            <li>The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.</li>
            <li>
              AlphaEarth Foundations GeoZarr mosaic is hosted on 
              <a
                href="https://source.coop/tge-labs/aef-mosaic"
                target="_blank"
                rel="noopener noreferrer"> Source Cooperative</a
              > and processed by <a href="https://github.com/geospatial-jeff/aef-mosaic" target="_blank" rel="noopener noreferrer">Geospatial Jeff</a> with the support of Taylor Geospatial Engine. 
            </li>
            <li>Annual snapshots 2017–2025, ~10 m / pixel, int8 quantized</li>
            <li>
              Basemap:
              <a
                href="https://carto.com"
                target="_blank"
                rel="noopener noreferrer">CARTO</a
              >
              dark-matter style ·
              <a
                href="https://www.openstreetmap.org"
                target="_blank"
                rel="noopener noreferrer">OpenStreetMap</a
              > data
            </li>
          </ul>
        </section>

        <section>
          <h3 class="silkscreen">BUILT WITH</h3>
          <ul>
            <li>
              <a
                href="https://github.com/developmentseed/deck.gl-raster"
                target="_blank"
                rel="noopener noreferrer">@developmentseed/deck.gl-raster</a
              >
            </li>
            <li>
              <a
                href="https://maplibre.org"
                target="_blank"
                rel="noopener noreferrer">maplibre-gl</a
              > basemap renderer
            </li>
            <li>
              <a
                href="https://github.com/manzt/zarrita.js"
                target="_blank"
                rel="noopener noreferrer">zarrita</a
              > zarr-in-the-browser
            </li>
            <li>Claude on 2026-04-29</li>
          </ul>
        </section>
        <section>
          <p>
            <a href="https://github.com/kovaca/aef-daw" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
          </p>
        </section>

        <p class="footer silkscreen silkscreen-dim">
          press ESC or click outside to close
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .dialog {
    position: relative;
    width: min(560px, 100%);
    max-height: 85vh;
    background:
      linear-gradient(
        180deg,
        var(--panel-rim) 0%,
        var(--panel-body) 6px,
        var(--panel-body) 100%
      );
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.7),
      inset 0 1px 0 var(--rim-highlight);
    display: flex;
    flex-direction: column;
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
  .screw.tl { top: 8px; left: 10px; }
  .screw.tr { top: 8px; right: 10px; }
  .screw.bl { bottom: 8px; left: 10px; }
  .screw.br { bottom: 8px; right: 10px; }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 22px 10px;
    border-bottom: 1px solid var(--panel-edge);
  }
  .title {
    margin: 0;
    font-family: "Inter", -apple-system, "Helvetica Neue", sans-serif;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.18em;
    color: var(--silkscreen);
    text-transform: uppercase;
  }
  .close {
    background: var(--panel-section);
    border: 1px solid var(--panel-edge);
    color: var(--silkscreen);
    width: 28px;
    height: 28px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0;
  }
  .close:hover {
    color: var(--led-amber);
    border-color: var(--led-amber);
  }
  .body {
    padding: 14px 22px 18px;
    overflow-y: auto;
    color: var(--text);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.55;
    scrollbar-width: thin;
    scrollbar-color: var(--screw) var(--panel-body);
  }
  .body::-webkit-scrollbar {
    width: 6px;
  }
  .body::-webkit-scrollbar-thumb {
    background: var(--screw);
    border-radius: 3px;
  }
  section {
    margin: 0 0 16px;
  }
  section h3 {
    margin: 0 0 6px;
    font-size: 10px;
  }
  section p,
  section li {
    color: var(--silkscreen);
  }
  section p {
    margin: 0 0 8px;
  }
  section strong {
    color: var(--led-amber);
    font-weight: 600;
  }
  /* section em {
    color: var(--silkscreen);
    font-style: italic;
  } */
  ul {
    margin: 0;
    padding-left: 16px;
  }
  ul li {
    margin: 0 0 4px;
  }
  a {
    color: var(--led-amber);
    text-decoration: none;
    border-bottom: 1px dashed transparent;
  }
  a:hover {
    border-bottom-color: var(--led-amber);
  }
  .footer {
    margin: 4px 0 0;
    font-size: 9px;
    text-align: center;
  }
</style>
