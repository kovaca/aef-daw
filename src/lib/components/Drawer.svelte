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
  let collapsed = $state(false);


  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--drawer-h",
      collapsed ? "28px" : "var(--drawer-expanded-h, 280px)",
    );
  });
</script>

<div class="drawer" class:collapsed>
  <!-- Panel screws — pure decoration. -->
  <span class="screw tl" aria-hidden="true"></span>
  <span class="screw tr" aria-hidden="true"></span>
  <span class="screw bl" aria-hidden="true"></span>
  <span class="screw br" aria-hidden="true"></span>

  <button
    class="handle"
    onclick={() => (collapsed = !collapsed)}
    aria-label={collapsed ? "Expand patchbay" : "Collapse patchbay"}
    aria-expanded={!collapsed}
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
    transition: height 180ms ease-out;
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
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0;
    font-size: 10px;
  }
  .handle:hover {
    background: #2a221c;
  }
  .grip {
    width: 60px;
    height: 4px;
    background: var(--screw);
    border-radius: 2px;
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
    }
    .switchboard-wrap {
      flex: 0 0 220px;
      width: 100%;
      border-bottom: 1px solid var(--panel-edge);
    }
  }
</style>
